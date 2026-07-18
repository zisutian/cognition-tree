import { useMemo } from "react";
import type {
  SyntaxProfileDraft,
  SyntaxProfileDraftBuildResult,
} from "../../../../ctn/syntax/profileDraft";
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
  activeSyntaxFileId,
  analysis,
  isSyntaxConfigured,
  syntaxCatalogNameConflictMessage,
  syntaxDraft,
  syntaxDraftResult,
}: {
  activeSyntaxFileId: string | null;
  analysis: WorkspaceAnalysis;
  isSyntaxConfigured: boolean;
  syntaxCatalogNameConflictMessage: string;
  syntaxDraft: SyntaxProfileDraft;
  syntaxDraftResult: SyntaxProfileDraftBuildResult;
}) {
  const syntaxDiagnostics = useMemo(
    () => activeSyntaxFileId
      ? createUiSyntaxDiagnostics(
          syntaxDraft,
          syntaxDraftResult,
          activeSyntaxFileId,
          syntaxCatalogNameConflictMessage,
        )
      : [],
    [
      activeSyntaxFileId,
      syntaxCatalogNameConflictMessage,
      syntaxDraft,
      syntaxDraftResult,
    ],
  );

  return selectWorkbenchDiagnostics({
    analysisDiagnostics: analysis.diagnostics,
    isSyntaxConfigured,
    syntaxDiagnostics,
  });
}
