import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSyntaxProfileDraft,
  createSyntaxProfileDraft,
  type SyntaxProfileDraft,
} from "../../../../ctn/syntax/profileDraft";
import { formatSyntaxProfileToml } from "../../../../ctn/syntax/profileToml";
import type { CtnSyntaxProfile } from "../../../../ctn/syntax/types";
import {
  attachWorkspaceSyntaxProfile,
} from "../../../workspace/context/workspaceContext";
import type { WorkspaceStructureIndex } from "../../../workspace/indexes/workspaceStructureIndex";

type UseSyntaxRuntimeOptions = {
  createDefaultSyntax: () => Promise<void>;
  isConfigured: boolean;
  syntaxProfile: CtnSyntaxProfile;
  syntaxSource: string;
  updateWorkspaceSyntaxSource: (source: string) => Promise<void>;
  workspace: WorkspaceStructureIndex | null;
};

export function resolveSyntaxDraftAfterPersistence({
  currentDraft,
  previousPersistedSource,
  syntaxProfile,
  syntaxSource,
}: {
  currentDraft: SyntaxProfileDraft;
  previousPersistedSource: string;
  syntaxProfile: CtnSyntaxProfile;
  syntaxSource: string;
}) {
  const currentDraftResult = buildSyntaxProfileDraft(currentDraft);
  const currentDraftSource = currentDraftResult.profile
    ? formatSyntaxProfileToml(currentDraftResult.profile)
    : null;

  if (currentDraftSource === syntaxSource) {
    return currentDraft;
  }

  return !previousPersistedSource || currentDraftSource === previousPersistedSource
    ? createSyntaxProfileDraft(syntaxProfile)
    : currentDraft;
}

export function isCurrentSyntaxPersistenceCompletion({
  active,
  completedSource,
  completedVersion,
  currentSource,
  currentVersion,
}: {
  active: boolean;
  completedSource: string;
  completedVersion: number;
  currentSource: string | null;
  currentVersion: number;
}) {
  return active &&
    completedVersion === currentVersion &&
    completedSource === currentSource;
}

export function startSyntaxDraftPersistence({
  draft,
  lastPersistedSource,
  persist,
}: {
  draft: SyntaxProfileDraft;
  lastPersistedSource: string;
  persist: (source: string) => Promise<void>;
}) {
  const result = buildSyntaxProfileDraft(draft);
  const source = result.profile
    ? formatSyntaxProfileToml(result.profile)
    : null;

  if (!source || source === lastPersistedSource) {
    return { completion: null, source };
  }

  try {
    return { completion: Promise.resolve(persist(source)), source };
  } catch (error) {
    return { completion: Promise.reject(error), source };
  }
}

export function useSyntaxRuntime({
  createDefaultSyntax,
  isConfigured,
  syntaxProfile,
  syntaxSource,
  updateWorkspaceSyntaxSource,
  workspace,
}: UseSyntaxRuntimeOptions) {
  const [syntaxDraft, setSyntaxDraft] = useState(() =>
    createSyntaxProfileDraft(syntaxProfile),
  );
  const draftEditVersionRef = useRef(0);
  const lastPersistedSyntaxSourceRef = useRef("");
  const latestDraftSourceRef = useRef<string | null>(null);
  const updateWorkspaceSyntaxSourceRef = useRef(updateWorkspaceSyntaxSource);
  const persistenceActiveRef = useRef(false);
  const syntaxDraftResult = useMemo(
    () => buildSyntaxProfileDraft(syntaxDraft),
    [syntaxDraft],
  );
  const syntaxDraftSource = useMemo(
    () =>
      syntaxDraftResult.profile
        ? formatSyntaxProfileToml(syntaxDraftResult.profile)
        : null,
    [syntaxDraftResult.profile],
  );
  latestDraftSourceRef.current = syntaxDraftSource;
  updateWorkspaceSyntaxSourceRef.current = updateWorkspaceSyntaxSource;
  const effectiveContext = useMemo(
    () =>
      workspace
        ? attachWorkspaceSyntaxProfile(
            workspace,
            syntaxDraftResult.profile ?? syntaxProfile,
          )
        : null,
    [syntaxDraftResult.profile, syntaxProfile, workspace],
  );

  useEffect(() => {
    const previousPersistedSource = lastPersistedSyntaxSourceRef.current;

    lastPersistedSyntaxSourceRef.current = syntaxSource;
    setSyntaxDraft((currentDraft) =>
      resolveSyntaxDraftAfterPersistence({
        currentDraft,
        previousPersistedSource,
        syntaxProfile,
        syntaxSource,
      }),
    );
  }, [syntaxProfile, syntaxSource]);

  useEffect(() => {
    persistenceActiveRef.current = true;

    return () => {
      persistenceActiveRef.current = false;
    };
  }, []);

  const updateSyntaxDraft = useCallback((nextDraft: SyntaxProfileDraft) => {
    draftEditVersionRef.current += 1;
    const version = draftEditVersionRef.current;
    const persistence = startSyntaxDraftPersistence({
      draft: nextDraft,
      lastPersistedSource: lastPersistedSyntaxSourceRef.current,
      persist: (source) => updateWorkspaceSyntaxSourceRef.current(source),
    });

    latestDraftSourceRef.current = persistence.source;
    setSyntaxDraft(nextDraft);

    if (persistence.completion && persistence.source) {
      const source = persistence.source;

      void persistence.completion
        .then(() => {
          if (isCurrentSyntaxPersistenceCompletion({
            active: persistenceActiveRef.current,
            completedSource: source,
            completedVersion: version,
            currentSource: latestDraftSourceRef.current,
            currentVersion: draftEditVersionRef.current,
          })) {
            lastPersistedSyntaxSourceRef.current = source;
          }
        })
        .catch(() => undefined);
    }
  }, []);

  return {
    createDefaultSyntax,
    effectiveContext,
    isConfigured,
    syntaxDraft,
    syntaxDraftResult,
    updateSyntaxDraft,
  };
}

export type SyntaxRuntime = ReturnType<typeof useSyntaxRuntime>;
