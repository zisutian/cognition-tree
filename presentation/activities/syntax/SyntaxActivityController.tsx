// SPDX-License-Identifier: GPL-3.0-or-later

import {
  usePageDriver,
  usePageNavigation,
  describePage,
} from "../../navigation/index.ts";

import { useEffect } from "react";
import type { JournalApplication } from "../../../application/journal/index.ts";
import type { SyntaxFocusTarget } from "../../../application/syntax/index.ts";
import type { TodoApplication } from "../../../application/todo/index.ts";
import type { WorkbenchDiagnostics } from "../../../application/workbench/index.ts";
import { createSyntaxActivityDiagnostics } from "../../../application/workbench/index.ts";
import type { ActivityControllerProps } from "../../ui/index.ts";
import type { WorkbenchWorkspaceState } from "../../workspace/index.ts";
import { createSyntaxActivitySlots } from "./SyntaxActivitySlots.tsx";
import { useSyntaxActivity } from "./useSyntaxActivity.ts";

export function SyntaxActivityController({
  active,
  application,
  onConsumeSystemSyntaxFocusRequest = () => undefined,
  onSyntaxLeaveBlockedChange = () => undefined,
  onSyntaxProblemsChange = () => undefined,
  renderActivity,
  systemSyntaxFocusRequest,
}: SyntaxActivityControllerProps) {
  const workspace =
    application.workspace.status === "ready"
      ? application.workspace.application
      : null;
  const journalSyntax =
    application.journal.status === "ready"
      ? application.journal.view.syntax
      : null;
  const todoSyntax =
    application.todo.status === "ready" ? application.todo.view.syntax : null;
  const view = useSyntaxActivity({
    focusTarget:
      systemSyntaxFocusRequest ??
      workspace?.navigation.syntaxFocusRequest ??
      null,
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
    onSyntaxProblemsChange(
      createSyntaxActivityDiagnostics({
        activeWorkspaceFileId: view.activeFileId,
        journalDiagnostics:
          application.journal.status === "ready"
            ? application.journal.view.diagnostics
            : null,
        syntaxDiagnostics: view.syntaxDiagnostics,
        selectedTarget: view.selectedTarget,
        todoDiagnostics:
          application.todo.status === "ready"
            ? application.todo.view.diagnostics
            : null,
        workspaceDiagnostics: workspace?.runtime.analysis.diagnostics ?? null,
      }),
    );
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

  const pages = usePageNavigation();
  const page = (id: string) => {
    const file = view.files.find((item) => item.id === id);
    if (file)
      return describePage(
        "syntax",
        "syntax",
        id,
        file.name,
        pages.getRepositoryId(),
      );
    const system = view.systemConfigurations.find((item) => item.owner === id);
    return system
      ? describePage("syntax", "syntax", id, `${system.label}语法`)
      : null;
  };
  usePageDriver("syntax", {
    current: () =>
      page(
        view.selectedTarget.kind === "workspace-file"
          ? view.selectedTarget.fileId
          : view.selectedTarget.kind,
      ),
    describe: (target) =>
      target.repositoryId !== null && !workspace ? undefined : page(target.id),
    select: (target) => {
      const file = view.files.find((item) => item.id === target.id);
      const system = view.systemConfigurations.find(
        (item) => item.owner === target.id,
      );
      if (file)
        return view.selectTarget({ kind: "workspace-file", fileId: file.id });
      if (system) return view.selectTarget({ kind: system.owner });
      return false;
    },
  });
  if (!active) {
    return null;
  }

  return renderActivity(() => createSyntaxActivitySlots({ view }));
}

export type SyntaxActivityApplication = {
  journal: SyntaxBuiltInState<JournalApplication>;
  todo: SyntaxBuiltInState<TodoApplication>;
  workspace: WorkbenchWorkspaceState;
};
export type SyntaxActivityControllerProps =
  ActivityControllerProps<SyntaxActivityApplication> & {
    onSyntaxLeaveBlockedChange?: (blocked: boolean) => void;
    onSyntaxProblemsChange?: (diagnostics: WorkbenchDiagnostics | null) => void;
    systemSyntaxFocusRequest?: Extract<
      SyntaxFocusTarget,
      { systemOwner: "journal" | "todo" }
    > | null;
    onConsumeSystemSyntaxFocusRequest?: (requestId: number) => void;
  };

type SyntaxBuiltInState<App extends JournalApplication | TodoApplication> =
  | { status: Exclude<App["status"], "ready"> }
  | {
      status: "ready";
      view: Pick<
        Extract<App, { status: "ready" }>["view"],
        "syntax" | "diagnostics"
      >;
    };
