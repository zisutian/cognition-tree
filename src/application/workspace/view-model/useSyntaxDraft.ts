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

type UseSyntaxDraftOptions = {
  isLoaded: boolean;
  syntaxProfile: CtnSyntaxProfile;
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

export function useSyntaxDraft({
  isLoaded,
  syntaxProfile,
  updateWorkspaceSyntaxSource,
  workspace,
}: UseSyntaxDraftOptions) {
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
    lastPersistedSyntaxSourceRef.current =
      formatSyntaxProfileToml(syntaxProfile);
    setSyntaxDraft(createSyntaxProfileDraft(syntaxProfile));
  }, [syntaxProfile]);

  useEffect(() => {
    updateWorkspaceSyntaxSourceRef.current = updateWorkspaceSyntaxSource;
  }, [updateWorkspaceSyntaxSource]);

  useEffect(() => {
    if (
      !isLoaded ||
      !syntaxDraftSource ||
      syntaxDraftSource === lastPersistedSyntaxSourceRef.current
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const source = syntaxDraftSource;

      void updateWorkspaceSyntaxSourceRef.current(source)
        .then(() => {
          lastPersistedSyntaxSourceRef.current = source;
          setSyntaxFeedback({
            message: "仓库语法已自动保存。",
            status: "success",
          });
        })
        .catch((error: unknown) => {
          setSyntaxFeedback({
            message: getErrorMessage(error, "仓库语法自动保存失败。"),
            status: "error",
          });
        });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [isLoaded, syntaxDraftSource]);

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
