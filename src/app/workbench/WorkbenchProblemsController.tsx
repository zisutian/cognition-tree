import type { ReactNode } from "react";
import type {
  JournalDiagnostics,
  JournalViewModel,
} from "../../application/journal";
import type {
  TodoDiagnostics,
  TodoViewModel,
} from "../../application/todo";
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
  type WorkbenchDiagnostics,
  type UiWorkbenchProblem,
  type UiWorkbenchProblems,
} from "../../application/problems/workbenchProblems";
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
    "openNoteLine" | "openPortableName" | "openSyntaxField"
  > | null;
  journalNavigation?: {
    openEntryLine: JournalViewModel["navigation"]["openEntryLine"];
  } | null;
  todoNavigation?: {
    openCollectionLine: TodoViewModel["navigation"]["openCollectionLine"];
    selectCollection: TodoViewModel["selectCollection"];
  } | null;
  syntaxNavigation?: {
    openSystemSyntax: (
      owner: "journal" | "todo",
      fieldId: string,
    ) => void;
  };
  onActiveActivityChange: (activityId: ActivityId) => void;
};

export function hasWorkbenchProblemsPanel(activeActivityId: ActivityId) {
  return activeActivityId !== "settings";
}

export function selectWorkbenchProblems({
  activeActivityId,
  diagnostics,
  journalDiagnostics,
  syntaxDiagnostics,
  todoDiagnostics,
  repositoryIssues,
  repositories,
  systemIssues,
}: {
  activeActivityId: ActivityId;
  diagnostics: UiWorkbenchDiagnostics;
  journalDiagnostics?: JournalDiagnostics;
  syntaxDiagnostics?: WorkbenchDiagnostics;
  todoDiagnostics?: TodoDiagnostics;
  repositoryIssues: WorkspaceRepositoryCatalogIssue[];
  repositories: WorkspaceRepositoryDescriptor[];
  systemIssues: SystemRepositoryRuntimeIssue[];
}): UiWorkbenchProblems {
  const emptyDiagnostics = {
    diagnostics: [],
    errorCount: 0,
    status: "ready" as const,
    warningCount: 0,
  };
  const scopedDiagnostics = activeActivityId === "journal"
    ? journalDiagnostics ?? emptyDiagnostics
    : activeActivityId === "todo"
      ? todoDiagnostics ?? emptyDiagnostics
      : activeActivityId === "syntax"
        ? syntaxDiagnostics ?? emptyDiagnostics
        : diagnostics;

  return createUiWorkbenchProblems(
    scopedDiagnostics,
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
  } else if (problem.target.kind === "journal-entry-line") {
    context.journalNavigation?.openEntryLine(
      problem.target.entryId,
      problem.target.lineNumber,
    );
    context.onActiveActivityChange("journal");
  } else if (problem.target.kind === "todo-collection-line") {
    context.todoNavigation?.openCollectionLine(
      problem.target.collectionId,
      problem.target.lineNumber,
    );
    context.onActiveActivityChange("todo");
  } else if (problem.target.kind === "system-syntax") {
    context.syntaxNavigation?.openSystemSyntax(
      problem.target.owner,
      "fieldId" in problem.target ? problem.target.fieldId : "syntax-root",
    );
    context.onActiveActivityChange("syntax");
  } else if (problem.target.kind === "portable-name") {
    if (problem.target.owner === "workspace") {
      context.workspaceNavigation?.openPortableName(
        problem.target.entity === "note"
          ? { entity: "note", noteId: problem.target.noteId }
          : { entity: "folder", folderId: problem.target.folderId },
      );
      context.onActiveActivityChange("notes");
    } else if (problem.target.owner === "todo") {
      context.todoNavigation?.selectCollection(problem.target.collectionId);
      context.onActiveActivityChange("todo");
    } else {
      context.repositoryNavigation.focusOrdinaryRepository(
        problem.target.repositoryId,
      );
      context.onActiveActivityChange("repository");
    }
  } else if (problem.target.kind === "repository-issue") {
    context.repositoryNavigation.focusOrdinaryIssue(problem.target.issueId);
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
  onOpenSystemSyntax,
  onActiveActivityChange,
  syntaxDiagnostics,
  workbench,
}: {
  activeActivityId: ActivityId;
  application: WorkbenchApplication;
  children: (problemsSlot: ReactNode | null) => ReactNode;
  onOpenSystemSyntax: (
    owner: "journal" | "todo",
    fieldId: string,
  ) => void;
  onActiveActivityChange: (activityId: ActivityId) => void;
  syntaxDiagnostics: WorkbenchDiagnostics | null;
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
  const journal = application.journal.status === "ready"
    ? application.journal.view
    : null;
  const todo = application.todo.status === "ready"
    ? application.todo.view
    : null;
  const problems = selectWorkbenchProblems({
    activeActivityId,
    diagnostics: workspace?.diagnostics ?? {
      diagnostics: [],
      errorCount: 0,
      status: "ready",
      warningCount: 0,
    },
    journalDiagnostics: journal?.diagnostics,
    syntaxDiagnostics: syntaxDiagnostics ?? undefined,
    todoDiagnostics: todo?.diagnostics,
    repositories: ordinaryCatalog?.repositories ?? [],
    repositoryIssues: ordinaryCatalog?.issues ?? [],
    systemIssues,
  });
  const openProblem = (problem: UiWorkbenchProblem) =>
    openWorkbenchProblem(problem, {
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
