import { useMemo } from "react";
import type {
  SyntaxProfileDraft,
  SyntaxProfileDraftBuildResult,
} from "../../../ctn/syntax/profileDraft";
import type { WorkspaceAnalysis } from "../analysis/workspaceAnalysis";
import {
  createUiSyntaxDiagnostics,
  createUiWorkbenchDiagnostics,
  type UiWorkbenchDiagnostic,
  type UiWorkbenchDiagnostics,
} from "../projection/viewDiagnostics";

export function selectWorkbenchDiagnostics({
  analysisDiagnostics,
  isSyntaxConfigured,
  syntaxDiagnostics,
}: {
  analysisDiagnostics: UiWorkbenchDiagnostics;
  isSyntaxConfigured: boolean;
  syntaxDiagnostics: UiWorkbenchDiagnostic[];
}) {
  if (syntaxDiagnostics.length > 0) {
    return createUiWorkbenchDiagnostics(syntaxDiagnostics, "ready");
  }

  return isSyntaxConfigured
    ? analysisDiagnostics
    : createUiWorkbenchDiagnostics([], "ready");
}

export function useWorkbenchDiagnostics({
  analysis,
  isSyntaxConfigured,
  syntaxDraft,
  syntaxDraftResult,
}: {
  analysis: WorkspaceAnalysis;
  isSyntaxConfigured: boolean;
  syntaxDraft: SyntaxProfileDraft;
  syntaxDraftResult: SyntaxProfileDraftBuildResult;
}) {
  const syntaxDiagnostics = useMemo(
    () => createUiSyntaxDiagnostics(syntaxDraft, syntaxDraftResult),
    [syntaxDraft, syntaxDraftResult],
  );

  return selectWorkbenchDiagnostics({
    analysisDiagnostics: analysis.diagnostics,
    isSyntaxConfigured,
    syntaxDiagnostics,
  });
}
