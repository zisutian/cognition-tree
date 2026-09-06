import { useMemo } from "react";
import type {
  CtnSyntaxDraft,
  CtnSyntaxDraftBuildResult,
} from "../../../core/ctn/syntax/draft";
import type { WorkspaceAnalysis } from "../../../application/workspace/analysis/workspaceAnalysis";
import { createUiWorkbenchDiagnostics, type UiWorkbenchDiagnostic, type UiWorkbenchDiagnostics } from "../../../application/workspace/projection/viewDiagnostics";
import { createUiSyntaxDiagnostics } from "../../../application/syntax/syntaxDiagnostics";

export function selectWorkbenchDiagnostics({
  analysisDiagnostics,
  isSyntaxConfigured,
  portableNameDiagnostics,
  syntaxDiagnostics,
}: {
  analysisDiagnostics: UiWorkbenchDiagnostics;
  isSyntaxConfigured: boolean;
  portableNameDiagnostics: UiWorkbenchDiagnostic[];
  syntaxDiagnostics: UiWorkbenchDiagnostic[];
}) {
  if (syntaxDiagnostics.length > 0) {
    return createUiWorkbenchDiagnostics(
      [...syntaxDiagnostics, ...portableNameDiagnostics],
      "ready",
    );
  }

  if (!isSyntaxConfigured) {
    return createUiWorkbenchDiagnostics(portableNameDiagnostics, "ready");
  }
  return portableNameDiagnostics.length === 0
    ? analysisDiagnostics
    : createUiWorkbenchDiagnostics(
        [...analysisDiagnostics.diagnostics, ...portableNameDiagnostics],
        analysisDiagnostics.status,
      );
}

export function useWorkbenchDiagnostics({
  activeSyntaxFileId,
  analysis,
  isSyntaxConfigured,
  portableNameDiagnostics,
  syntaxCatalogNameConflictMessage,
  syntaxDraft,
  syntaxDraftResult,
}: {
  activeSyntaxFileId: string | null;
  analysis: WorkspaceAnalysis;
  isSyntaxConfigured: boolean;
  portableNameDiagnostics: UiWorkbenchDiagnostic[];
  syntaxCatalogNameConflictMessage: string;
  syntaxDraft: CtnSyntaxDraft | null;
  syntaxDraftResult: CtnSyntaxDraftBuildResult | null;
}) {
  const syntaxDiagnostics = useMemo(
    () => activeSyntaxFileId && syntaxDraft && syntaxDraftResult
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
    portableNameDiagnostics,
    syntaxDiagnostics,
  });
}
