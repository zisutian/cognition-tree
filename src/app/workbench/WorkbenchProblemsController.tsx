import type { ReactNode } from "react";
import type { WorkspaceApplication } from "../../application/workspace/runtime/useWorkspaceApplication";
import type { UiWorkbenchDiagnostics } from "../../application/workspace/projection/viewDiagnostics";
import {
  createUiWorkbenchProblems,
  type UiWorkbenchProblem,
  type UiWorkbenchProblems,
} from "../../application/workspace/projection/viewProblems";
import type { WorkspaceRepositoryCatalogIssue } from "../../storage/repository/workspaceRepositoryCatalog";
import type { ActivityId } from "../../ui/activityTypes";
import { ProblemsPanel } from "../../ui/problems/ProblemsPanel";
import { useWorkbenchProblemsShortcut } from "../../ui/problems/useProblemsShortcut";
import type { WorkbenchController } from "../../ui/workbench/useWorkbenchLayout";

type WorkbenchProblemOpenContext = {
  expandPanels: () => void;
  navigation: Pick<
    WorkspaceApplication["navigation"],
    "openNoteLine" | "openRepositoryIssue" | "openSyntaxField"
  >;
  onActiveActivityChange: (activityId: ActivityId) => void;
};

export function hasWorkbenchProblemsPanel(activeActivityId: ActivityId) {
  return activeActivityId !== "settings";
}

export function selectWorkbenchProblems({
  activeActivityId,
  diagnostics,
  repositoryIssues,
}: {
  activeActivityId: ActivityId;
  diagnostics: UiWorkbenchDiagnostics;
  repositoryIssues: WorkspaceRepositoryCatalogIssue[];
}): UiWorkbenchProblems {
  return createUiWorkbenchProblems(
    diagnostics,
    activeActivityId === "repository" ? repositoryIssues : [],
  );
}

export function openWorkbenchProblem(
  problem: UiWorkbenchProblem,
  context: WorkbenchProblemOpenContext,
) {
  if (problem.target.kind === "note-line") {
    context.navigation.openNoteLine(
      problem.target.noteId,
      problem.target.lineNumber,
    );
    context.onActiveActivityChange("notes");
  } else if (problem.target.kind === "syntax-field") {
    context.navigation.openSyntaxField(
      problem.target.syntaxFileId,
      problem.target.fieldId,
    );
    context.onActiveActivityChange("syntax");
  } else {
    context.navigation.openRepositoryIssue(problem.target.issueId);
    context.onActiveActivityChange("repository");
  }

  context.expandPanels();
}

export function WorkbenchProblemsController({
  activeActivityId,
  application,
  children,
  onActiveActivityChange,
  workbench,
}: {
  activeActivityId: ActivityId;
  application: Pick<
    WorkspaceApplication,
    "diagnostics" | "navigation" | "repository"
  >;
  children: (problemsSlot: ReactNode | null) => ReactNode;
  onActiveActivityChange: (activityId: ActivityId) => void;
  workbench: WorkbenchController;
}) {
  const problems = selectWorkbenchProblems({
    activeActivityId,
    diagnostics: application.diagnostics,
    repositoryIssues: application.repository.issues,
  });
  const openProblem = (problem: UiWorkbenchProblem) =>
    openWorkbenchProblem(problem, {
      expandPanels: workbench.expandPanels,
      navigation: application.navigation,
      onActiveActivityChange,
    });

  const problemsEnabled = hasWorkbenchProblemsPanel(activeActivityId);

  useWorkbenchProblemsShortcut({
    enabled: problemsEnabled,
    onToggle: workbench.toggleProblems,
  });

  return children(
    problemsEnabled ? (
      <ProblemsPanel
        expanded={workbench.layout.problemsExpanded}
        onOpen={openProblem}
        onToggle={workbench.toggleProblems}
        view={problems}
      />
    ) : null,
  );
}
