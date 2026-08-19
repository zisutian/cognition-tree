import type { ReactNode } from "react";
import type {
  JournalDiagnostics,
  JournalViewModel,
} from "../../../application/journal";
import type {
  TodoDiagnostics,
  TodoViewModel,
} from "../../../application/todo";
import type { WorkbenchApplication } from "../../activities/workbenchApplication";
import type { RepositoryNavigation } from "../../../application/repository/repositoryNavigation";
import {
  projectBuiltInCatalogFailure,
  projectBuiltInRuntimeIssues,
  type BuiltInRuntimeIssue,
} from "../../../application/repository/projectBuiltInIssues";
import {
  projectWorkspaceRepositoryRuntimeIssues,
  type WorkspaceRepositoryRuntimeIssue,
} from "../../../application/repository/projectWorkspaceRepositoryIssues";
import type { WorkspaceApplication } from "../../workspace/runtime/useWorkspaceApplication";
import type { UiWorkbenchDiagnostics } from "../../../application/workspace/projection/viewDiagnostics";
import {
  createUiWorkbenchProblems,
  projectUiOperationalProblems,
  type WorkbenchDiagnostics,
  type UiWorkbenchOperationalProblem,
  type UiWorkbenchProblem,
  type UiWorkbenchProblems,
} from "../../../application/problems/workbenchProblems";
import type { VersionedRepositoryPersistenceState } from "../../../application/persistence/versionedRepositorySaveQueue";
import type { WorkspaceRepositoryCatalogIssue } from "../../../application/repository/workspaceRepositoryCatalog";
import type { WorkspaceRepositoryDescriptor } from "../../../application/repository/workspaceRepositoryCatalog";
import type { ActivityId } from "../../ui/activityTypes";
import {
  getActivityLabel,
  isActivityId,
} from "../../activities/activityCatalog";
import { ProblemsPanel } from "../../ui/problems/ProblemsPanel";
import { useWorkbenchFeedback } from "../../ui/shared/FeedbackProvider";
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

export type SyntaxProblemOwner = "journal" | "todo" | "workspace";

export function projectPersistenceStatus(
  label: "代办" | "日记" | "笔记",
  persistence: VersionedRepositoryPersistenceState<string>,
) {
  switch (persistence.status) {
    case "saved":
      return "";
    case "saving-local":
      return `${label} · 正在保存`;
    case "pending-sync":
      return `${label} · 等待同步`;
    case "syncing":
      return `${label} · 正在同步`;
    case "offline":
      return `${label} · 离线`;
    case "conflict":
      return `${label} · 同步冲突`;
    case "error":
      return `${label} · 保存失败`;
  }
}

export function selectWorkbenchPersistenceStatus(
  activeActivityId: ActivityId,
  application: WorkbenchApplication,
) {
  if (activeActivityId === "notes") {
    if (application.repository.session.status === "ready") {
      return projectPersistenceStatus(
        "笔记",
        application.repository.session.persistence,
      );
    }
    return application.repository.session.status === "loading"
      ? "笔记 · 正在载入"
      : application.repository.session.status === "failed"
        ? "笔记 · 载入失败"
        : "";
  }
  if (activeActivityId === "journal") {
    return application.journal.status === "ready"
      ? projectPersistenceStatus("日记", application.journal.view.persistence)
      : application.journal.status === "loading"
        ? "日记 · 正在载入"
        : application.journal.status === "failed"
          ? "日记 · 载入失败"
          : "";
  }
  if (activeActivityId === "todo") {
    return application.todo.status === "ready"
      ? projectPersistenceStatus("代办", application.todo.view.persistence)
      : application.todo.status === "loading"
        ? "代办 · 正在载入"
        : application.todo.status === "failed"
          ? "代办 · 载入失败"
          : "";
  }
  return "";
}

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
  repositoryRuntimeIssues = [],
  repositories,
  builtInIssues,
  operationalProblems = [],
  syntaxOwner = "workspace",
}: {
  activeActivityId: ActivityId;
  diagnostics: UiWorkbenchDiagnostics;
  journalDiagnostics?: JournalDiagnostics;
  syntaxDiagnostics?: WorkbenchDiagnostics;
  todoDiagnostics?: TodoDiagnostics;
  repositoryIssues: WorkspaceRepositoryCatalogIssue[];
  repositoryRuntimeIssues?: WorkspaceRepositoryRuntimeIssue[];
  repositories: WorkspaceRepositoryDescriptor[];
  builtInIssues: BuiltInRuntimeIssue[];
  operationalProblems?: UiWorkbenchOperationalProblem[];
  syntaxOwner?: SyntaxProblemOwner;
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

  const scopedBuiltInIssues = activeActivityId === "repository"
    ? builtInIssues
    : activeActivityId === "journal" ||
        (activeActivityId === "syntax" && syntaxOwner === "journal")
      ? builtInIssues.filter((issue) => issue.kind === "catalog" ||
        issue.id === "journal")
      : activeActivityId === "todo" ||
          (activeActivityId === "syntax" && syntaxOwner === "todo")
        ? builtInIssues.filter((issue) => issue.kind === "catalog" ||
          issue.id === "todo")
        : [];
  const scopedRepositoryRuntimeIssues = activeActivityId === "repository" ||
      (!(["journal", "todo"] as ActivityId[]).includes(activeActivityId) &&
        (activeActivityId !== "syntax" || syntaxOwner === "workspace"))
    ? repositoryRuntimeIssues
    : [];

  return createUiWorkbenchProblems(
    scopedDiagnostics,
    activeActivityId === "repository" ? repositoryIssues : [],
    activeActivityId === "repository" ? repositories : [],
    scopedBuiltInIssues,
    scopedRepositoryRuntimeIssues,
    operationalProblems,
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
  } else if (problem.target.kind === "repository-runtime") {
    context.repositoryNavigation.focusOrdinaryRepository(
      problem.target.repositoryId,
    );
    context.onActiveActivityChange("repository");
  } else if (problem.target.kind === "repository-catalog") {
    context.repositoryNavigation.focusCatalog();
    context.onActiveActivityChange("repository");
  } else if (problem.target.kind === "built-in-issue") {
    context.repositoryNavigation.focusBuiltIn(problem.target.id);
    context.onActiveActivityChange("repository");
  } else if (problem.target.kind === "built-in-catalog") {
    context.repositoryNavigation.focusCatalog();
    context.onActiveActivityChange("repository");
  } else if (
    problem.target.kind === "operational-error" &&
    isActivityId(problem.target.sourceScope)
  ) {
    context.onActiveActivityChange(problem.target.sourceScope);
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
  syntaxOwner = "workspace",
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
  syntaxOwner?: SyntaxProblemOwner;
  workbench: WorkbenchController;
}) {
  const feedback = useWorkbenchFeedback();
  const ordinaryCatalog = application.repository.catalogState.status === "ready"
    ? application.repository.catalogState
    : null;
  const builtInCatalog =
    application.repository.builtIns.catalog.state.status === "ready"
      ? application.repository.builtIns.catalog.state
      : null;
  const builtInIssues = builtInCatalog
    ? projectBuiltInRuntimeIssues({
        issues: builtInCatalog.issues,
        repositories: builtInCatalog.repositories,
        sessions: application.repository.builtIns.sessions,
      })
    : application.repository.builtIns.catalog.state.status === "failed"
      ? [projectBuiltInCatalogFailure(
          application.repository.builtIns.catalog.state.errorMessage,
        )]
      : [];
  const repositoryRuntimeIssues = projectWorkspaceRepositoryRuntimeIssues(
    application.repository,
  );
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
    repositoryRuntimeIssues,
    builtInIssues,
    operationalProblems: projectUiOperationalProblems(
      feedback.snapshot.errors.filter(
        ({ scope }) => scope === activeActivityId,
      ),
      (scope) => isActivityId(scope) ? getActivityLabel(scope) : scope,
    ),
    syntaxOwner,
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
  const transientStatus = feedback.snapshot.transient?.scope === activeActivityId
    ? feedback.snapshot.transient.message
    : "";
  const statusMessage = transientStatus ||
    selectWorkbenchPersistenceStatus(activeActivityId, application) ||
    (problems.status === "collecting" ? "正在检查…" : "");

  useWorkbenchProblemsShortcut({
    enabled: problemsEnabled,
    onToggle: workbench.toggleProblems,
  });

  return children(
    problemsEnabled ? (
      <ProblemsPanel
        expanded={workbench.layout.problemsExpanded}
        onDismiss={(problem) => {
          if (problem.target.kind === "operational-error") {
            feedback.controller.dismiss(problem.target.feedbackId);
          }
        }}
        onOpen={openProblem}
        onToggle={workbench.toggleProblems}
        statusMessage={statusMessage}
        view={problems}
      />
    ) : null,
  );
}
