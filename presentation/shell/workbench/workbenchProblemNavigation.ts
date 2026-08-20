// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  JournalViewModel,
} from "../../../application/journal";
import type {
  TodoViewModel,
} from "../../../application/todo";
import type {
  UiWorkbenchProblem,
} from "../../../application/workbench/problems/workbenchProblems";
import type {
  RepositoryNavigation,
} from "../../../application/repository/repositoryNavigation";
import type { WorkspaceApplication } from
  "../../workspace/runtime/useWorkspaceApplication";
import type { ActivityId } from "../../ui/activityTypes";
import { isActivityId } from "../../activities/activityCatalog";

export type WorkbenchProblemOpenContext = {
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
