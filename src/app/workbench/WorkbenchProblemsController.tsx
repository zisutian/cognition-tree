import type { ReactNode } from "react";
import type { WorkbenchApplication } from "../../application/workbench/workbenchApplication";
import type { RepositoryNavigation } from "../../application/repository/useRepositoryNavigation";
import {
  projectSystemRepositoryRuntimeIssues,
  type SystemRepositoryRuntimeIssue,
} from "../../application/repository/projectSystemRepositoryIssues";
import type { WorkspaceApplication } from "../../application/workspace/runtime/useWorkspaceApplication";
import type { UiWorkbenchDiagnostics } from "../../application/workspace/projection/viewDiagnostics";
import {
  createUiWorkbenchProblems,
  type UiWorkbenchProblem,
  type UiWorkbenchProblems,
} from "../../application/workspace/projection/viewProblems";
import type { WorkspaceRepositoryCatalogIssue } from "../../storage/repository/workspaceRepositoryCatalog";
import type { WorkspaceRepositoryDescriptor } from "../../storage/repository/workspaceRepositoryCatalog";
import type { ActivityId } from "../../ui/activityTypes";
import { ProblemsPanel } from "../../ui/problems/ProblemsPanel";
import { useWorkbenchProblemsShortcut } from "../../ui/problems/useProblemsShortcut";
import type { WorkbenchController } from "../../ui/workbench/useWorkbenchLayout";

type WorkbenchProblemOpenContext = {
  expandPanels: () => void;
  repositoryNavigation: RepositoryNavigation;
  workspaceNavigation: Pick<
    WorkspaceApplication["navigation"],
    "openNoteLine" | "openSyntaxField"
  > | null;
  onActiveActivityChange: (activityId: ActivityId) => void;
};

export function hasWorkbenchProblemsPanel(activeActivityId: ActivityId) {
  return activeActivityId !== "settings";
}

export function selectWorkbenchProblems({
  activeActivityId,
  diagnostics,
  repositoryIssues,
  repositories,
  systemIssues,
}: {
  activeActivityId: ActivityId;
  diagnostics: UiWorkbenchDiagnostics;
  repositoryIssues: WorkspaceRepositoryCatalogIssue[];
  repositories: WorkspaceRepositoryDescriptor[];
  systemIssues: SystemRepositoryRuntimeIssue[];
}): UiWorkbenchProblems {
  return createUiWorkbenchProblems(
    diagnostics,
    activeActivityId === "repository" ? repositoryIssues : [],
    activeActivityId === "repository" ? repositories : [],
    activeActivityId === "repository" ? systemIssues : [],
  );
}

export function openWorkbenchProblem(
  problem: UiWorkbenchProblem,
  context: WorkbenchProblemOpenContext,
) {
  if (problem.target.kind === "note-line") {
    context.workspaceNavigation?.openNoteLine(
      problem.target.noteId,
      problem.target.lineNumber,
    );
    context.onActiveActivityChange("notes");
  } else if (problem.target.kind === "syntax-field") {
    context.workspaceNavigation?.openSyntaxField(
      problem.target.syntaxFileId,
      problem.target.fieldId,
    );
    context.onActiveActivityChange("syntax");
  } else if (problem.target.kind === "repository-issue") {
    context.repositoryNavigation.focusOrdinaryIssue(problem.target.issueId);
    context.onActiveActivityChange("repository");
  } else if (problem.target.kind === "repository-name-conflict") {
    context.repositoryNavigation.focusOrdinaryRepository(
      problem.target.repositoryId,
    );
    context.onActiveActivityChange("repository");
  } else {
    context.repositoryNavigation.focusSystemRepository(problem.target.purpose);
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
  application: WorkbenchApplication;
  children: (problemsSlot: ReactNode | null) => ReactNode;
  onActiveActivityChange: (activityId: ActivityId) => void;
  workbench: WorkbenchController;
}) {
  const ordinaryCatalog = application.repository.catalogState.status === "ready"
    ? application.repository.catalogState
    : null;
  const systemCatalog =
    application.repository.systems.catalog.state.status === "ready"
      ? application.repository.systems.catalog.state
      : null;
  const systemIssues = systemCatalog
    ? projectSystemRepositoryRuntimeIssues({
        issues: systemCatalog.issues,
        repositories: systemCatalog.repositories,
        sessions: application.repository.systems.sessions,
      })
    : [];
  const workspace = application.workspace.status === "ready"
    ? application.workspace.application
    : null;
  const problems = selectWorkbenchProblems({
    activeActivityId,
    diagnostics: workspace?.diagnostics ?? {
      diagnostics: [],
      errorCount: 0,
      status: "ready",
      warningCount: 0,
    },
    repositories: ordinaryCatalog?.repositories ?? [],
    repositoryIssues: ordinaryCatalog?.issues ?? [],
    systemIssues,
  });
  const openProblem = (problem: UiWorkbenchProblem) =>
    openWorkbenchProblem(problem, {
      expandPanels: workbench.expandPanels,
      repositoryNavigation: application.repository.navigation,
      workspaceNavigation: workspace?.navigation ?? null,
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
