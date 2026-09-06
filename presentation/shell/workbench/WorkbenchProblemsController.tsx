// SPDX-License-Identifier: GPL-3.0-or-later

import { useRef, type ReactNode } from "react";
import type { WorkbenchApplication } from "../application/workbenchApplication.ts";
import {
  type WorkbenchDiagnostics,
  type UiWorkbenchProblem,
  projectWorkbenchProblems,
} from "../../../application/workbench/index.ts";

import type { ActivityId, WorkbenchController } from "../../ui/index.ts";
import { getActivityLabel, isActivityId } from "./activityCatalog.tsx";
import {
  ProblemsPanel,
  StatusBar,
  runActivityFeedbackAction,
  useWorkbenchFeedback,
  useWorkbenchProblemsShortcut,
} from "../../ui/index.ts";

import { openWorkbenchProblem } from "./workbenchProblemNavigation.ts";
import { selectWorkbenchPersistenceStatus } from "./workbenchProblemsPanelProjection.ts";

export function WorkbenchProblemsController({
  activeActivityId,
  application,
  children,
  onOpenSystemSyntax,
  onActiveActivityChange,
  statusMessage: activityStatusMessage,
  syntaxDiagnostics,
  workbench,
}: {
  activeActivityId: ActivityId;
  application: WorkbenchApplication;
  children: (slots: { problemsSlot: ReactNode; statusBarSlot: ReactNode }) => ReactNode;
  onOpenSystemSyntax: (owner: "journal" | "todo", fieldId: string) => void;
  onActiveActivityChange: (
    activityId: ActivityId,
    beforeChange?: () => boolean | void,
  ) => void;
  statusMessage: string;
  syntaxDiagnostics: WorkbenchDiagnostics | null;
  workbench: WorkbenchController;
}) {
  const problemsToggleRef = useRef<HTMLButtonElement>(null);
  const feedback = useWorkbenchFeedback();
  const workspace =
    application.workspace.status === "ready"
      ? application.workspace.application
      : null;
  const journal =
    application.journal.status === "ready" ? application.journal.view : null;
  const todo =
    application.todo.status === "ready" ? application.todo.view : null;
  const problems = projectWorkbenchProblems({
    agentProblems: application.agent.state.status?.configurationProblem
      ? [
        {
          code: "configuration_unavailable",
          id: "agent-configuration-problem",
          message: application.agent.state.status.configurationProblem,
          sessionId: null,
        },
      ]
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

  const transient =
    feedback.snapshot.transient?.scope === activeActivityId
      ? feedback.snapshot.transient
      : null;
  const transientStatus =
    transient?.tone === "info"
      ? transient.message
      : transient?.tone === "error"
        ? (feedback.snapshot.problems.find(
          ({ id }) => id === transient.problemId,
        )?.message ?? "")
        : "";
  const statusMessage =
    activityStatusMessage ||
    transientStatus ||
    selectWorkbenchPersistenceStatus(activeActivityId, application) ||
    (problems.status === "collecting" ? "正在检查…" : "");

  useWorkbenchProblemsShortcut({
    onToggle: workbench.toggleProblems,
  });

  return children({
    problemsSlot: <ProblemsPanel
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
      onToggle={() => {
        workbench.toggleProblems();
        problemsToggleRef.current?.focus();
      }}
      view={problems}
    />,
    statusBarSlot: (
      <StatusBar
        errorCount={problems.errorCount}
        warningCount={problems.warningCount}
        expanded={workbench.layout.problemsExpanded}
        onToggleProblems={workbench.toggleProblems}
        statusMessage={statusMessage}
        toggleButtonRef={problemsToggleRef}
      />
    ),
  });
}
