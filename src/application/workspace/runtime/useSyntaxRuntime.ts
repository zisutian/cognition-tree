import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildSyntaxProfileDraft,
  createSyntaxProfileDraft,
  type SyntaxProfileDraft,
} from "../../../ctn/syntax/profileDraft";
import { formatSyntaxProfileToml } from "../../../ctn/syntax/profileToml";
import type { CtnSyntaxProfile } from "../../../ctn/syntax/types";
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

export type SyntaxPersistenceErrorEvent = {
  id: number;
  message: string;
};

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

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
  const [persistenceError, setPersistenceError] =
    useState<SyntaxPersistenceErrorEvent | null>(null);
  const draftEditVersionRef = useRef(0);
  const lastPersistedSyntaxSourceRef = useRef("");
  const nextPersistenceErrorIdRef = useRef(1);
  const updateWorkspaceSyntaxSourceRef = useRef(updateWorkspaceSyntaxSource);
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
  const effectiveContext = useMemo(
    () =>
      workspace && syntaxDraftResult.profile
        ? attachWorkspaceSyntaxProfile(workspace, syntaxDraftResult.profile)
        : null,
    [syntaxDraftResult.profile, workspace],
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
    updateWorkspaceSyntaxSourceRef.current = updateWorkspaceSyntaxSource;
  }, [updateWorkspaceSyntaxSource]);

  useEffect(() => {
    if (
      draftEditVersionRef.current === 0 ||
      !syntaxDraftSource ||
      syntaxDraftSource === lastPersistedSyntaxSourceRef.current
    ) {
      return;
    }

    const source = syntaxDraftSource;
    let isActive = true;

    void updateWorkspaceSyntaxSourceRef.current(source)
      .then(() => {
        if (isActive) {
          lastPersistedSyntaxSourceRef.current = source;
          setPersistenceError(null);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setPersistenceError({
            id: nextPersistenceErrorIdRef.current,
            message: getErrorMessage(error, "仓库语法自动保存失败。"),
          });
          nextPersistenceErrorIdRef.current += 1;
        }
      });

    return () => {
      isActive = false;
    };
  }, [syntaxDraftSource]);

  const updateSyntaxDraft = (nextDraft: SyntaxProfileDraft) => {
    draftEditVersionRef.current += 1;
    setSyntaxDraft(nextDraft);
  };

  return {
    createDefaultSyntax,
    effectiveContext,
    isConfigured,
    persistenceError,
    syntaxDraft,
    syntaxDraftResult,
    updateSyntaxDraft,
  };
}

export type SyntaxRuntime = ReturnType<typeof useSyntaxRuntime>;
