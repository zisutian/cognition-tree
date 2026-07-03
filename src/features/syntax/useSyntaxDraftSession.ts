import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildSyntaxProfileDraft,
  createSyntaxProfileDraft,
  type SyntaxProfileDraft,
} from "../../ctn-syntax/profileDraft";
import { formatSyntaxProfileToml } from "../../ctn-syntax/profileToml";
import type { CtnSyntaxProfile } from "../../ctn-syntax/types";
import {
  attachWorkspaceSyntaxProfile,
  type WorkspaceRuntime,
} from "../../workspace/runtime/workspaceRuntime";

type UseSyntaxDraftSessionOptions = {
  isWorkspaceLoaded: boolean;
  syntaxProfile: CtnSyntaxProfile;
  updateSyntaxFile: (source: string) => Promise<void>;
  workspace: WorkspaceRuntime;
};

type SyntaxProfileFeedback = {
  message: string;
  status: "error" | "success";
};

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function useSyntaxDraftSession({
  isWorkspaceLoaded,
  syntaxProfile,
  updateSyntaxFile,
  workspace,
}: UseSyntaxDraftSessionOptions) {
  const [syntaxDraft, setSyntaxDraft] = useState(() =>
    createSyntaxProfileDraft(syntaxProfile),
  );
  const [syntaxFeedback, setSyntaxFeedback] =
    useState<SyntaxProfileFeedback | null>(null);
  const lastPersistedSyntaxSourceRef = useRef("");
  const updateSyntaxFileRef = useRef(updateSyntaxFile);
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
  const effectiveWorkspace = useMemo(
    () =>
      syntaxDraftResult.profile
        ? attachWorkspaceSyntaxProfile(workspace, syntaxDraftResult.profile)
        : workspace,
    [syntaxDraftResult.profile, workspace],
  );

  useEffect(() => {
    lastPersistedSyntaxSourceRef.current =
      formatSyntaxProfileToml(syntaxProfile);
    setSyntaxDraft(createSyntaxProfileDraft(syntaxProfile));
  }, [syntaxProfile]);

  useEffect(() => {
    updateSyntaxFileRef.current = updateSyntaxFile;
  }, [updateSyntaxFile]);

  useEffect(() => {
    if (
      !isWorkspaceLoaded ||
      !syntaxDraftSource ||
      syntaxDraftSource === lastPersistedSyntaxSourceRef.current
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const source = syntaxDraftSource;

      void updateSyntaxFileRef.current(source)
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
  }, [isWorkspaceLoaded, syntaxDraftSource]);

  const updateSyntaxDraft = (nextDraft: SyntaxProfileDraft) => {
    setSyntaxDraft(nextDraft);
    setSyntaxFeedback(null);
  };

  return {
    effectiveWorkspace,
    syntaxDraft,
    syntaxDraftResult,
    syntaxFeedback,
    updateSyntaxDraft,
  };
}
