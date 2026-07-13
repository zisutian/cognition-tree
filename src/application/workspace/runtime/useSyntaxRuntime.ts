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
  syntaxProfile: CtnSyntaxProfile;
  syntaxSource: string;
  updateWorkspaceSyntaxSource: (source: string) => Promise<void>;
  workspace: WorkspaceStructureIndex | null;
};

type SyntaxProfileFeedback = {
  message: string;
  status: "error" | "success";
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
  syntaxProfile,
  syntaxSource,
  updateWorkspaceSyntaxSource,
  workspace,
}: UseSyntaxRuntimeOptions) {
  const [syntaxDraft, setSyntaxDraft] = useState(() =>
    createSyntaxProfileDraft(syntaxProfile),
  );
  const [syntaxFeedback, setSyntaxFeedback] =
    useState<SyntaxProfileFeedback | null>(null);
  const lastPersistedSyntaxSourceRef = useRef("");
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
    setSyntaxFeedback((currentFeedback) =>
      currentFeedback?.status === "error"
        ? {
            message: "仓库语法已自动保存。",
            status: "success",
          }
        : currentFeedback,
    );
  }, [syntaxProfile, syntaxSource]);

  useEffect(() => {
    updateWorkspaceSyntaxSourceRef.current = updateWorkspaceSyntaxSource;
  }, [updateWorkspaceSyntaxSource]);

  useEffect(() => {
    if (
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
          setSyntaxFeedback({
            message: "仓库语法已自动保存。",
            status: "success",
          });
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setSyntaxFeedback({
            message: getErrorMessage(error, "仓库语法自动保存失败。"),
            status: "error",
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [syntaxDraftSource]);

  const updateSyntaxDraft = (nextDraft: SyntaxProfileDraft) => {
    setSyntaxDraft(nextDraft);
    setSyntaxFeedback(null);
  };

  return {
    effectiveContext,
    syntaxDraft,
    syntaxDraftResult,
    syntaxFeedback,
    updateSyntaxDraft,
  };
}

export type SyntaxRuntime = ReturnType<typeof useSyntaxRuntime>;
