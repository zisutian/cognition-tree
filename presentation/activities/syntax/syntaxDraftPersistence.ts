// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildCtnSyntaxDraft,
  createCtnSyntaxDraft,
  type CtnSyntaxDraft,
} from "../../../core/ctn/syntax/draft";
import { formatCtnSyntaxV2 } from "../../../core/ctn/syntax/formatter";
import type {
  CtnCompiledSyntax,
  CtnSyntaxOwner,
} from "../../../core/ctn/syntax/types";

export function createCtnSyntaxDraftSource(
  draft: CtnSyntaxDraft,
  owner: CtnSyntaxOwner,
) {
  const result = buildCtnSyntaxDraft(draft, owner);

  return {
    result,
    source: result.syntax
      ? formatCtnSyntaxV2(result.definition, owner)
      : null,
  };
}

export function isCurrentSyntaxPersistenceCompletion({
  active,
  completedFileId,
  completedSource,
  completedVersion,
  currentFileId,
  currentSource,
  currentVersion,
}: {
  active: boolean;
  completedFileId?: string | null;
  completedSource: string;
  completedVersion: number;
  currentFileId?: string | null;
  currentSource: string | null;
  currentVersion: number;
}) {
  return active &&
    completedFileId === currentFileId &&
    completedVersion === currentVersion &&
    completedSource === currentSource;
}

export function resolveCtnSyntaxDraftAfterSourceChange({
  currentDraft,
  owner,
  previousPersistedSource,
  syntax,
  syntaxSource,
}: {
  currentDraft: CtnSyntaxDraft;
  owner: CtnSyntaxOwner;
  previousPersistedSource: string;
  syntax: CtnCompiledSyntax;
  syntaxSource: string;
}) {
  const currentDraftSource = createCtnSyntaxDraftSource(
    currentDraft,
    owner,
  ).source;

  if (currentDraftSource === syntaxSource) {
    return currentDraft;
  }
  return !previousPersistedSource ||
      currentDraftSource === previousPersistedSource
    ? createCtnSyntaxDraft(syntax)
    : currentDraft;
}

export function startCtnSyntaxDraftPersistence({
  canPersist = true,
  draft,
  lastPersistedSource,
  owner,
  persist,
}: {
  canPersist?:
    | boolean
    | ((build: ReturnType<typeof createCtnSyntaxDraftSource>) => boolean);
  draft: CtnSyntaxDraft;
  lastPersistedSource: string;
  owner: CtnSyntaxOwner;
  persist: (source: string) => Promise<void>;
}) {
  const build = createCtnSyntaxDraftSource(draft, owner);
  const source = build.source;
  const persistenceAllowed = typeof canPersist === "function"
    ? canPersist(build)
    : canPersist;

  if (!persistenceAllowed || !source || source === lastPersistedSource) {
    return { completion: null, source };
  }

  try {
    return { completion: Promise.resolve(persist(source)), source };
  } catch (error) {
    return { completion: Promise.reject(error), source };
  }
}

export type CtnSyntaxDraftRuntimeSource = {
  source: string;
  syntax: CtnCompiledSyntax;
};

export function useCtnSyntaxDraftRuntime({
  canPersist = true,
  owner,
  persist,
  source,
  targetKey,
}: {
  canPersist?:
    | boolean
    | ((build: ReturnType<typeof createCtnSyntaxDraftSource>) => boolean);
  owner: CtnSyntaxOwner;
  persist: (source: string) => void | Promise<void>;
  source: CtnSyntaxDraftRuntimeSource | null;
  targetKey: string | null;
}) {
  const [draft, setDraft] = useState<CtnSyntaxDraft | null>(() =>
    source ? createCtnSyntaxDraft(source.syntax) : null
  );
  const editVersionRef = useRef(0);
  const activeRef = useRef(false);
  const canPersistRef = useRef(canPersist);
  const latestSourceRef = useRef<string | null>(source?.source ?? null);
  const lastPersistedSourceRef = useRef(source?.source ?? "");
  const lastTargetKeyRef = useRef(targetKey);
  const persistRef = useRef(persist);
  canPersistRef.current = canPersist;
  persistRef.current = persist;
  const build = useMemo(
    () => draft ? createCtnSyntaxDraftSource(draft, owner) : null,
    [draft, owner],
  );
  latestSourceRef.current = build?.source ?? null;

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!source || targetKey === null) {
      editVersionRef.current += 1;
      lastTargetKeyRef.current = targetKey;
      lastPersistedSourceRef.current = "";
      latestSourceRef.current = null;
      setDraft(null);
      return;
    }
    const previousPersistedSource = lastPersistedSourceRef.current;

    if (lastTargetKeyRef.current !== targetKey) {
      editVersionRef.current += 1;
      lastTargetKeyRef.current = targetKey;
      lastPersistedSourceRef.current = source.source;
      latestSourceRef.current = source.source;
      setDraft(createCtnSyntaxDraft(source.syntax));
      return;
    }
    lastPersistedSourceRef.current = source.source;
    setDraft((currentDraft) =>
      currentDraft
        ? resolveCtnSyntaxDraftAfterSourceChange({
            currentDraft,
            owner,
            previousPersistedSource,
            syntax: source.syntax,
            syntaxSource: source.source,
          })
        : createCtnSyntaxDraft(source.syntax)
    );
  }, [owner, source?.source, source?.syntax, targetKey]);

  const updateDraft = useCallback((nextDraft: CtnSyntaxDraft) => {
    editVersionRef.current += 1;
    const version = editVersionRef.current;
    const completedTargetKey = lastTargetKeyRef.current;
    const persistence = startCtnSyntaxDraftPersistence({
      canPersist: canPersistRef.current,
      draft: nextDraft,
      lastPersistedSource: lastPersistedSourceRef.current,
      owner,
      persist: (nextSource) =>
        Promise.resolve(persistRef.current(nextSource)),
    });

    setDraft(nextDraft);
    latestSourceRef.current = persistence.source;
    if (!persistence.completion || !persistence.source) {
      return;
    }
    const completedSource = persistence.source;

    void persistence.completion.then(() => {
      if (isCurrentSyntaxPersistenceCompletion({
        active: activeRef.current,
        completedFileId: completedTargetKey,
        completedSource,
        completedVersion: version,
        currentFileId: lastTargetKeyRef.current,
        currentSource: latestSourceRef.current,
        currentVersion: editVersionRef.current,
      })) {
        lastPersistedSourceRef.current = completedSource;
      }
    }).catch(() => undefined);
  }, [owner]);
  const revertDraft = useCallback(() => {
    if (!source || targetKey === null) {
      return;
    }
    editVersionRef.current += 1;
    lastPersistedSourceRef.current = source.source;
    latestSourceRef.current = source.source;
    setDraft(createCtnSyntaxDraft(source.syntax));
  }, [source, targetKey]);

  return {
    available: source !== null && targetKey !== null,
    draft,
    draftResult: build?.result ?? null,
    hasDraftErrors: Boolean(build && !build.result.syntax),
    owner,
    revertDraft,
    source: build?.source ?? null,
    updateDraft,
  };
}

export type CtnSyntaxDraftRuntime = ReturnType<
  typeof useCtnSyntaxDraftRuntime
>;
