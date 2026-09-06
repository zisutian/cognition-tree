// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  findJournalEntry,
  listJournalEntries,
  type JournalContent,
  type JournalEntryId,
  formatJournalEntryDate,
  resolveJournalSelection,
} from "../../../core/journal/index.ts";

import type {
  JournalParseIndex,
} from "../../../core/journal/index.ts";

import {
  consumeJournalFocusRequest,
  createJournalFocusRequest,
  createJournalMutationActions,
  normalizeJournalBodyLineNumber,
  resolveRequestedJournalSelectionAfterDelete,
  type JournalApplication,
  type JournalApplicationServices,
  type JournalDeleteMutationResult,
  type JournalRepositorySession,
  createJournalViewModel,
  type JournalActiveBodyPosition,
  type JournalFocusRequest,
  startJournalWorkspaceReferenceResolution,
  type JournalWorkspaceReferenceDestination,
  type JournalWorkspaceReferenceResolver,
  type JournalWorkspaceReferenceResolutionState,
} from "../../../application/journal/index.ts";



type PreparedJournalState = {
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

export function useJournalApplication({
  openWorkspaceNote,
  referenceResolutionGeneration,
  referenceResolver,
  services,
  session,
}: {
  openWorkspaceNote?: (
    destination: JournalWorkspaceReferenceDestination,
  ) => void;
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
  const [workspaceReferences, setWorkspaceReferences] =
    useState<JournalWorkspaceReferenceResolutionState>({ status: "idle" });
  const readyState = session.state.status === "ready" ? session.state : null;
  const prepared = useMemo(() => readyState
    ? {
        content: readyState.content,
        index: readyState.projection,
      } satisfies PreparedJournalState
    : null, [readyState]);
  const activeEntryId = prepared
    ? resolveJournalSelection(prepared.content, requestedEntryId)
    : null;

  useEffect(() => {
    const references = prepared?.index.referenceGraph.workspaceReferences ?? [];

    return startJournalWorkspaceReferenceResolution({
      publish: setWorkspaceReferences,
      references,
      resolver: referenceResolver ?? null,
    });
  }, [
    prepared?.index.referenceGraph.workspaceReferences,
    referenceResolutionGeneration,
    referenceResolver,
  ]);

  useEffect(() => {
    if (prepared && requestedEntryId !== activeEntryId) {
      setRequestedEntryId(activeEntryId);
    }
  }, [activeEntryId, prepared, requestedEntryId]);

  useEffect(() => {
    if (!prepared || !activeEntryId) return;
    const pathKeys = journalCalendarPathKeys(prepared.content, activeEntryId);

    setExpandedCalendarKeys((current) => {
      if (pathKeys.every((key) => current.has(key))) return current;
      return new Set([...current, ...pathKeys]);
    });
  }, [activeEntryId, prepared]);

  useEffect(() => {
    if (
      focusRequest &&
      (!prepared ||
        !listJournalEntries(prepared.content).some(
          ({ id }) => id === focusRequest.entryId,
        ))
    ) {
      setFocusRequest(null);
    }
  }, [focusRequest, prepared]);

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
    if (!prepared || !listJournalEntries(prepared.content).some(({ id }) => id === entryId)) {
      return;
    }
    setRequestedEntryId(entryId);
    setFocusRequest(null);
    setActiveBodyPosition(null);
  }, [prepared]);
  const openEntryLine = useCallback((
    entryId: JournalEntryId,
    lineNumber: number,
  ) => {
    if (!prepared || !listJournalEntries(prepared.content).some(({ id }) => id === entryId)) {
      return;
    }
    issueFocusRequest(entryId, lineNumber);
  }, [issueFocusRequest, prepared]);
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
  const view = useMemo(() =>
    prepared && readyState
      ? createJournalViewModel({
          activeBodyPosition,
          activeEntryId,
          consumeFocusRequest,
          content: prepared.content,
          createEntry: mutations.createEntry,
          deleteEntry: mutations.deleteEntry,
          expandedCalendarKeys,
          focusRequest,
          index: prepared.index,
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
      prepared,
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
        throw new Error("Prepared Journal ready state has no view.");
      }
      return { reload: session.reload, status: "ready", view };
  }
}
