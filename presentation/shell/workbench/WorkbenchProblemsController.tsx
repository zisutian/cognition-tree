// SPDX-License-Identifier: GPL-3.0-or-later

import type { ReactNode } from "react";
import type { WorkbenchApplication } from "../application/workbenchApplication";
import {
  type WorkbenchDiagnostics,
  type UiWorkbenchProblem,
} from "../../../application/workbench/problems/workbenchProblems";
import {
  projectWorkbenchProblems,
} from "../../../application/workbench/problems/workbenchProblemsProjection";
import type { ActivityId } from "../../ui/activityTypes";
import {
  getActivityLabel,
  isActivityId,
} from "./activityCatalog";
import { ProblemsPanel } from "../../ui/problems/ProblemsPanel";
import {
  runActivityFeedbackAction,
  useWorkbenchFeedback,
} from "../../ui/shared/FeedbackProvider";
import { useWorkbenchProblemsShortcut } from "../../ui/problems/useProblemsShortcut";
import type { WorkbenchController } from "../../ui/workbench/useWorkbenchLayout";
import { openWorkbenchProblem } from "./workbenchProblemNavigation";
import {
  selectWorkbenchPersistenceStatus,
} from "./workbenchProblemsPanelProjection";

export function WorkbenchProblemsController({
  activeActivityId,
  application,
  children,
  onOpenSystemSyntax,
  onActiveActivityChange,
  syntaxDiagnostics,
  workbench,
}: {
  activeActivityId: ActivityId;
  application: WorkbenchApplication;
  children: (problemsSlot: ReactNode) => ReactNode;
  onOpenSystemSyntax: (
    owner: "journal" | "todo",
    fieldId: string,
  ) => void;
  onActiveActivityChange: (activityId: ActivityId) => void;
  syntaxDiagnostics: WorkbenchDiagnostics | null;
  workbench: WorkbenchController;
}) {
  const feedback = useWorkbenchFeedback();
  const workspace = application.workspace.status === "ready"
    ? application.workspace.application
    : null;
  const journal = application.journal.status === "ready"
    ? application.journal.view
    : null;
  const todo = application.todo.status === "ready"
    ? application.todo.view
    : null;
  const problems = projectWorkbenchProblems({
    agentProblems: application.agent.state.status?.configurationProblem
      ? [{
          code: "configuration_unavailable",
          id: "agent-configuration-problem",
          message: application.agent.state.status.configurationProblem,
          sessionId: null,
        }]
      : [],
    diagnostics: workspace?.diagnostics ?? {
      diagnostics: [],
      errorCount: 0,
      status: "ready",
      warningCount: 0,
    },
    feedbackErrors: feedback.snapshot.problems,
    getScopeLabel: (scope) =>
      isActivityId(scope) ? getActivityLabel(scope) : scope,
    journalDiagnostics: journal?.diagnostics,
    repository: application.repository,
    syntaxDiagnostics: syntaxDiagnostics ?? undefined,
    todoDiagnostics: todo?.diagnostics,
  });
  const openProblem = (problem: UiWorkbenchProblem) =>
    openWorkbenchProblem(problem, {
      agentNavigation: application.agent.controller,
      expandPanels: workbench.expandPanels,
      journalNavigation: journal?.navigation ?? null,
      todoNavigation: todo
        ? {
            ...todo.navigation,
            selectCollection: todo.selectCollection,
          }
        : null,
      repositoryNavigation: application.repository.navigation,
      syntaxNavigation: { openSystemSyntax: onOpenSystemSyntax },
      workspaceNavigation: workspace?.navigation ?? null,
      onActiveActivityChange,
    });

  const transient = feedback.snapshot.transient?.scope === activeActivityId
    ? feedback.snapshot.transient
    : null;
  const transientStatus = transient?.tone === "info"
    ? transient.message
    : transient?.tone === "error"
      ? feedback.snapshot.problems.find(({ id }) => id === transient.problemId)
        ?.message ?? ""
      : "";
  const statusMessage = transientStatus ||
    selectWorkbenchPersistenceStatus(activeActivityId, application) ||
    (problems.status === "collecting" ? "正在检查…" : "");

  useWorkbenchProblemsShortcut({
    onToggle: workbench.toggleProblems,
  });

  return children(
    <ProblemsPanel
      expanded={workbench.layout.problemsExpanded}
      onCopyRequestId={(requestId) => {
        void runActivityFeedbackAction(
          feedback.controller,
          activeActivityId,
          async () => {
            const clipboard = globalThis.navigator?.clipboard;

            if (!clipboard) {
              throw new Error("当前环境不支持复制请求编号。");
            }
            await clipboard.writeText(requestId);
          },
        );
      }}
      onDismiss={(problem) => {
        if (problem.target.kind === "operational-error") {
          feedback.controller.dismiss(problem.target.problemId);
        }
      }}
      onOpen={openProblem}
      onToggle={workbench.toggleProblems}
      statusMessage={statusMessage}
      view={problems}
    />,
  );
}
