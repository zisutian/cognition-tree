// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalApplication } from "../../../application/journal/index.ts";
import type { TodoApplication } from "../../../application/todo/index.ts";
import type { WorkbenchWorkspaceState } from "../../workspace/index.ts";
import type { WorkbenchDiagnostics } from "../../../application/workbench/index.ts";
import type { SyntaxFocusTarget } from "../../../application/syntax/index.ts";
import { useEffect } from "react";
import { useSyntaxActivity } from "./useSyntaxActivity.ts";
import { createSyntaxActivityDiagnostics } from "../../../application/workbench/index.ts";
import { createSyntaxActivitySlots } from "./SyntaxActivitySlots.tsx";
import type { ActivityControllerProps } from "../../ui/index.ts";

export function SyntaxActivityController({
  active,
  application,
  onConsumeSystemSyntaxFocusRequest = () => undefined,
  onSyntaxLeaveBlockedChange = () => undefined,
  onSyntaxProblemsChange = () => undefined,
  renderActivity,
  systemSyntaxFocusRequest,
}: SyntaxActivityControllerProps) {
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
    }));
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

export type SyntaxActivityApplication = { journal: SyntaxBuiltInState<JournalApplication>; todo: SyntaxBuiltInState<TodoApplication>; workspace: WorkbenchWorkspaceState; };
export type SyntaxActivityControllerProps = ActivityControllerProps<SyntaxActivityApplication> & {
  onSyntaxLeaveBlockedChange?: (blocked: boolean) => void;
  onSyntaxProblemsChange?: (diagnostics: WorkbenchDiagnostics | null) => void;
  systemSyntaxFocusRequest?: Extract<SyntaxFocusTarget, { systemOwner: "journal" | "todo" }> | null;
  onConsumeSystemSyntaxFocusRequest?: (requestId: number) => void;
};

type SyntaxBuiltInState<App extends JournalApplication | TodoApplication> = { status: Exclude<App["status"], "ready"> } | { status: "ready"; view: Pick<Extract<App, { status: "ready" }>["view"], "syntax" | "diagnostics"> };
