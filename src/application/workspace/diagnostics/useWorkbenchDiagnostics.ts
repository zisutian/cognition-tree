import { useEffect, useMemo, useState } from "react";
import type {
  SyntaxProfileDraft,
  SyntaxProfileDraftBuildResult,
} from "../../../ctn/syntax/profileDraft";
import type { WorkspaceContext } from "../../../workspace/context/workspaceContext";
import type { WorkspaceParseIndexCache } from "../../../workspace/indexes/workspaceParseIndex";
import {
  createUiSyntaxDiagnostics,
  type UiWorkbenchDiagnostics,
} from "../projection/viewDiagnostics";
import { useWorkspaceParseIndex } from "../runtime/useWorkspaceParseIndex";
import { createWorkbenchDiagnosticPlan } from "./workbenchDiagnosticPlan";
import { startWorkspaceDiagnosticCollection } from "./workspaceDiagnosticCollection";

type DiagnosticState = {
  token: object;
  view: UiWorkbenchDiagnostics;
};

export function useWorkbenchDiagnostics({
  effectiveContext,
  isSyntaxConfigured,
  parseIndexCache,
  syntaxDraft,
  syntaxDraftResult,
}: {
  effectiveContext: WorkspaceContext | null;
  isSyntaxConfigured: boolean;
  parseIndexCache: WorkspaceParseIndexCache;
  syntaxDraft: SyntaxProfileDraft;
  syntaxDraftResult: SyntaxProfileDraftBuildResult;
}) {
  const index = useWorkspaceParseIndex(
    parseIndexCache,
    isSyntaxConfigured ? effectiveContext : null,
  );
  const syntaxDiagnostics = useMemo(
    () => createUiSyntaxDiagnostics(syntaxDraft, syntaxDraftResult),
    [syntaxDraft, syntaxDraftResult],
  );
  const token = useMemo(
    () => ({}),
    [index, isSyntaxConfigured, syntaxDiagnostics],
  );
  const plan = useMemo(() => {
    return createWorkbenchDiagnosticPlan({
      canCollectWorkspace: isSyntaxConfigured && Boolean(index),
      syntaxDiagnostics,
    });
  }, [index, isSyntaxConfigured, syntaxDiagnostics]);
  const [state, setState] = useState<DiagnosticState>({
    token,
    view: plan.initialView,
  });

  useEffect(() => {
    setState({ token, view: plan.initialView });

    if (!plan.collectWorkspace || !index) {
      return;
    }

    return startWorkspaceDiagnosticCollection({
      index,
      onUpdate(view) {
        setState((current) =>
          current.token === token ? { token, view } : current,
        );
      },
    });
  }, [index, plan, token]);

  return state.token === token ? state.view : plan.initialView;
}
