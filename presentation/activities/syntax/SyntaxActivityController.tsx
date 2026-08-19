import { useEffect } from "react";
import { useSyntaxActivity } from "./useSyntaxActivity";
import { createSyntaxActivityDiagnostics } from "../../../application/problems/syntaxActivityDiagnostics";
import { createSyntaxActivitySlots } from "./SyntaxActivitySlots";
import type { ActivityControllerProps } from "../activityController";

export function SyntaxActivityController({
  active,
  application,
  onConsumeSystemSyntaxFocusRequest = () => undefined,
  onSyntaxLeaveBlockedChange = () => undefined,
  onSyntaxProblemsChange = () => undefined,
  renderActivity,
  systemSyntaxFocusRequest,
}: ActivityControllerProps) {
  const workspace = application.workspace.status === "ready"
    ? application.workspace.application
    : null;
  const journalSyntax = application.journal.status === "ready"
    ? application.journal.view.syntax
    : null;
  const todoSyntax = application.todo.status === "ready"
    ? application.todo.view.syntax
    : null;
  const view = useSyntaxActivity({
    focusTarget:
      systemSyntaxFocusRequest ?? workspace?.navigation.syntaxFocusRequest ?? null,
    journalSyntax,
    onConsumeFocusTarget: (requestId) => {
      if (systemSyntaxFocusRequest?.requestId === requestId) {
        onConsumeSystemSyntaxFocusRequest(requestId);
      } else {
        workspace?.navigation.consumeSyntaxFocusRequest(requestId);
      }
    },
    todoSyntax,
    workspace: workspace?.syntax ?? null,
  });

  useEffect(() => {
    onSyntaxLeaveBlockedChange(view.hasDraftErrors);
    return () => onSyntaxLeaveBlockedChange(false);
  }, [onSyntaxLeaveBlockedChange, view.hasDraftErrors]);

  useEffect(() => {
    onSyntaxProblemsChange(createSyntaxActivityDiagnostics({
      activeWorkspaceFileId: view.activeFileId,
      journalDiagnostics: application.journal.status === "ready"
        ? application.journal.view.diagnostics
        : null,
      syntaxDiagnostics: view.syntaxDiagnostics,
      selectedTarget: view.selectedTarget,
      todoDiagnostics: application.todo.status === "ready"
        ? application.todo.view.diagnostics
        : null,
      workspaceDiagnostics: workspace?.runtime.analysis.diagnostics ?? null,
    }), view.selectedTarget.kind === "workspace-file"
      ? "workspace"
      : view.selectedTarget.kind);
  }, [
    application.journal.status === "ready"
      ? application.journal.view.diagnostics
      : null,
    application.todo.status === "ready"
      ? application.todo.view.diagnostics
      : null,
    onSyntaxProblemsChange,
    view.activeFileId,
    view.syntaxDiagnostics,
    view.selectedTarget,
    workspace?.runtime.analysis.diagnostics,
  ]);

  if (!active) {
    return null;
  }

  return renderActivity(({ onCollapseDetail }) =>
    createSyntaxActivitySlots({ onCollapseDetail, view })
  );
}
