// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createJournalParseIndex } from "../../../../../core/journal/indexes/journalParseIndex";
import {
  findJournalEntry,
  formatJournalEntryDate,
  listJournalEntries,
  type JournalContent,
  type JournalEntryId,
} from "../../../../../core/journal/model/journalContent";
import type {
  JournalParseIndex,
} from "../../../../../core/journal/indexes/journalParseIndex";
import { resolveJournalSelection } from "../../../../../core/journal/queries/journalQueries";
import {
  consumeJournalFocusRequest,
  createJournalFocusRequest,
  createJournalMutationActions,
  normalizeJournalBodyLineNumber,
  requireJournalContent,
  resolveRequestedJournalSelectionAfterDelete,
  type JournalApplication,
  type JournalApplicationServices,
  type JournalDeleteMutationResult,
  type JournalRepositorySession,
} from "../../../../../application/journal/journalApplication";
import {
  createJournalViewModel,
  type JournalActiveBodyPosition,
  type JournalFocusRequest,
} from "../../../../../application/journal/journalViewModel";
import {
  startJournalWorkspaceReferenceResolution,
  type JournalWorkspaceNoteDestination,
  type JournalWorkspaceReferenceResolver,
  type JournalWorkspaceReferenceResolutionState,
} from "../../../../../application/journal/journalExternalReferences";

type ParsedJournalState = {
  content: JournalContent;
  index: JournalParseIndex;
};

function journalCalendarPathKeys(
  content: JournalContent,
  entryId: JournalEntryId,
) {
  const entry = findJournalEntry(content, entryId);

  if (!entry) return [];
  const date = formatJournalEntryDate(
    entry.createdAt,
    entry.timezoneOffsetMinutes,
  );
  return [
    `year:${date.slice(0, 4)}`,
    `month:${date.slice(0, 7)}`,
  ];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The journal content could not be loaded.";
}

function getEditorErrorMessage(
  persistence: Extract<
    JournalRepositorySession["state"],
    { status: "ready" }
  >["persistence"],
) {
  if (persistence.status === "error") {
    return persistence.message;
  }
  if (persistence.status === "conflict") {
    return "日记存在同步冲突，请前往仓库处理。";
  }
  return "";
}

export function useJournalApplication({
  openWorkspaceNote,
  referenceResolutionGeneration,
  referenceResolver,
  services,
  session,
}: {
  openWorkspaceNote?: (destination: JournalWorkspaceNoteDestination) => void;
  referenceResolutionGeneration?: number | string;
  referenceResolver?: JournalWorkspaceReferenceResolver | null;
  services: JournalApplicationServices;
  session: JournalRepositorySession;
}): JournalApplication {
  const [requestedEntryId, setRequestedEntryId] =
    useState<JournalEntryId | null>(null);
  const [focusRequest, setFocusRequest] =
    useState<JournalFocusRequest | null>(null);
  const [activeBodyPosition, setActiveBodyPosition] =
    useState<JournalActiveBodyPosition | null>(null);
  const [expandedCalendarKeys, setExpandedCalendarKeys] =
    useState<Set<string>>(() => new Set());
  const nextFocusRequestIdRef = useRef(1);
  const previousIndexRef = useRef<JournalParseIndex | null>(null);
  const [workspaceReferences, setWorkspaceReferences] =
    useState<JournalWorkspaceReferenceResolutionState>({ status: "idle" });
  const sessionContent = session.state.status === "ready"
    ? session.state.content
    : null;
  const parsedResult = useMemo(() => {
    if (!sessionContent) {
      return { parsed: null, errorMessage: "" };
    }
    try {
      const content = requireJournalContent(sessionContent);

      return {
        errorMessage: "",
        parsed: {
          content,
          index: createJournalParseIndex(content, previousIndexRef.current),
        } satisfies ParsedJournalState,
      };
    } catch (error) {
      return { errorMessage: getErrorMessage(error), parsed: null };
    }
  }, [sessionContent]);
  const parsed = parsedResult.parsed;
  const activeEntryId = parsed
    ? resolveJournalSelection(parsed.content, requestedEntryId)
    : null;

  useEffect(() => {
    if (parsed) {
      previousIndexRef.current = parsed.index;
    }
  }, [parsed]);

  useEffect(() => {
    const references = parsed?.index.referenceGraph.workspaceReferences ?? [];

    return startJournalWorkspaceReferenceResolution({
      publish: setWorkspaceReferences,
      references,
      resolver: referenceResolver ?? null,
    });
  }, [
    parsed?.index.referenceGraph.workspaceReferences,
    referenceResolutionGeneration,
    referenceResolver,
  ]);

  useEffect(() => {
    if (parsed && requestedEntryId !== activeEntryId) {
      setRequestedEntryId(activeEntryId);
    }
  }, [activeEntryId, parsed, requestedEntryId]);

  useEffect(() => {
    if (!parsed || !activeEntryId) return;
    const pathKeys = journalCalendarPathKeys(parsed.content, activeEntryId);

    setExpandedCalendarKeys((current) => {
      if (pathKeys.every((key) => current.has(key))) return current;
      return new Set([...current, ...pathKeys]);
    });
  }, [activeEntryId, parsed]);

  useEffect(() => {
    if (
      focusRequest &&
      (!parsed ||
        !listJournalEntries(parsed.content).some(
          ({ id }) => id === focusRequest.entryId,
        ))
    ) {
      setFocusRequest(null);
    }
  }, [focusRequest, parsed]);

  const issueFocusRequest = useCallback((
    entryId: JournalEntryId,
    lineNumber: number,
  ) => {
    const requestId = nextFocusRequestIdRef.current;

    nextFocusRequestIdRef.current += 1;
    const request = createJournalFocusRequest(
      requestId,
      entryId,
      lineNumber,
    );

    setRequestedEntryId(entryId);
    setActiveBodyPosition({
      entryId,
      lineNumber: request.lineNumber,
    });
    setFocusRequest(request);
  }, []);
  const onCreated = useCallback((entryId: JournalEntryId) => {
    issueFocusRequest(entryId, 1);
  }, [issueFocusRequest]);
  const onDeleted = useCallback((result: JournalDeleteMutationResult) => {
    setRequestedEntryId((current) =>
      resolveRequestedJournalSelectionAfterDelete({
        ...result,
        requestedEntryId: current,
      })
    );
    setFocusRequest((current) =>
      current?.entryId === result.deletedEntryId ? null : current
    );
    setActiveBodyPosition((current) =>
      current?.entryId === result.deletedEntryId ? null : current
    );
  }, []);
  const mutations = useMemo(
    () => createJournalMutationActions({
      onCreated,
      onDeleted,
      services,
      session,
    }),
    [onCreated, onDeleted, services, session],
  );
  const selectEntry = useCallback((entryId: JournalEntryId) => {
    if (!parsed || !listJournalEntries(parsed.content).some(({ id }) => id === entryId)) {
      return;
    }
    setRequestedEntryId(entryId);
    setFocusRequest(null);
    setActiveBodyPosition(null);
  }, [parsed]);
  const openEntryLine = useCallback((
    entryId: JournalEntryId,
    lineNumber: number,
  ) => {
    if (!parsed || !listJournalEntries(parsed.content).some(({ id }) => id === entryId)) {
      return;
    }
    issueFocusRequest(entryId, lineNumber);
  }, [issueFocusRequest, parsed]);
  const consumeFocusRequest = useCallback((requestId: number) => {
    setFocusRequest((current) =>
      consumeJournalFocusRequest(current, requestId)
    );
  }, []);
  const updateActiveBodyLine = useCallback((lineNumber: number) => {
    if (!activeEntryId) {
      setActiveBodyPosition(null);
      return;
    }
    const normalizedLineNumber = normalizeJournalBodyLineNumber(lineNumber);

    setActiveBodyPosition((current) =>
      current?.entryId === activeEntryId &&
        current.lineNumber === normalizedLineNumber
        ? current
        : { entryId: activeEntryId, lineNumber: normalizedLineNumber }
    );
  }, [activeEntryId]);
  const toggleCalendarKey = useCallback((key: string) => {
    setExpandedCalendarKeys((current) => {
      const next = new Set(current);

      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const readyState = session.state.status === "ready" ? session.state : null;
  const view = useMemo(() =>
    parsed && readyState
      ? createJournalViewModel({
          activeBodyPosition,
          activeEntryId,
          consumeFocusRequest,
          content: parsed.content,
          createEntry: mutations.createEntry,
          deleteEntry: mutations.deleteEntry,
          editorErrorMessage: getEditorErrorMessage(readyState.persistence),
          expandedCalendarKeys,
          focusRequest,
          index: parsed.index,
          openEntryLine,
          openWorkspaceNote,
          persistence: readyState.persistence,
          selectEntry,
          toggleCalendarKey,
          updateActiveBodyLine,
          updateEntryBody: mutations.updateEntryBody,
          updateSyntaxSource: mutations.updateSyntaxSource,
          workspaceReferences,
        })
      : null,
    [
      activeBodyPosition,
      activeEntryId,
      consumeFocusRequest,
      expandedCalendarKeys,
      focusRequest,
      mutations,
      openEntryLine,
      openWorkspaceNote,
      parsed,
      readyState,
      selectEntry,
      toggleCalendarKey,
      updateActiveBodyLine,
      workspaceReferences,
    ],
  );

  switch (session.state.status) {
    case "unavailable":
      return { reload: session.reload, status: "unavailable" };
    case "loading":
      return { status: "loading" };
    case "failed":
      return {
        errorMessage: session.state.errorMessage,
        reload: session.reload,
        status: "failed",
      };
    case "ready":
      if (!view) {
        return {
          errorMessage:
            parsedResult.errorMessage || "The journal content is unavailable.",
          reload: session.reload,
          status: "failed",
        };
      }
      return { reload: session.reload, status: "ready", view };
  }
}
