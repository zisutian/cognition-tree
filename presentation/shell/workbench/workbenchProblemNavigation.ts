// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalViewModel } from "../../../application/journal/index.ts";
import type { TodoViewModel } from "../../../application/todo/index.ts";
import type { UiWorkbenchProblem } from "../../../application/workbench/index.ts";
import type { RepositoryNavigation } from "../../../application/repository/index.ts";
import type { WorkspaceApplication } from "../../workspace/index.ts";
import type { ActivityId } from "../../ui/index.ts";
import { isActivityId } from "./activityCatalog.tsx";

export type WorkbenchProblemOpenContext = {
  agentNavigation?: {
    selectSession(sessionId: string): void;
  };
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
    openSystemSyntax: (owner: "journal" | "todo", fieldId: string) => void;
  };
  onActiveActivityChange: (
    activityId: ActivityId,
    beforeChange?: () => boolean | void,
  ) => void;
};

export function openWorkbenchProblem(
  problem: UiWorkbenchProblem,
  context: WorkbenchProblemOpenContext,
) {
  const target = problem.target;
  const activityId: ActivityId | null =
    target.kind === "note-line"
      ? "notes"
      : target.kind === "syntax-field" || target.kind === "system-syntax"
        ? "syntax"
        : target.kind === "journal-entry-line"
          ? "journal"
          : target.kind === "todo-collection-line"
            ? "todo"
            : target.kind === "portable-name"
              ? target.owner === "workspace"
                ? "notes"
                : target.owner === "todo"
                  ? "todo"
                  : "repository"
              : target.kind === "agent-problem"
                ? "agent"
                : target.kind === "operational-error"
                  ? isActivityId(target.sourceScope)
                    ? target.sourceScope
                    : null
                  : "repository";
  if (!activityId) return;
  context.onActiveActivityChange(activityId, () => {
    if (problem.target.kind === "note-line") {
      context.workspaceNavigation?.openNoteLine(
        problem.target.noteId,
        problem.target.lineNumber,
      );
    } else if (problem.target.kind === "syntax-field") {
      context.workspaceNavigation?.openSyntaxField(
        problem.target.syntaxFileId,
        problem.target.fieldId,
      );
    } else if (problem.target.kind === "journal-entry-line") {
      context.journalNavigation?.openEntryLine(
        problem.target.entryId,
        problem.target.lineNumber,
      );
    } else if (problem.target.kind === "todo-collection-line") {
      context.todoNavigation?.openCollectionLine(
        problem.target.collectionId,
        problem.target.lineNumber,
      );
    } else if (problem.target.kind === "system-syntax") {
      context.syntaxNavigation?.openSystemSyntax(
        problem.target.owner,
        "fieldId" in problem.target ? problem.target.fieldId : "syntax-root",
      );
    } else if (problem.target.kind === "portable-name") {
      if (problem.target.owner === "workspace") {
        context.workspaceNavigation?.openPortableName(
          problem.target.entity === "note"
            ? { entity: "note", noteId: problem.target.noteId }
            : { entity: "folder", folderId: problem.target.folderId },
        );
      } else if (problem.target.owner === "todo") {
        context.todoNavigation?.selectCollection(problem.target.collectionId);
      } else {
        context.repositoryNavigation.focusOrdinaryRepository(
          problem.target.repositoryId,
        );
      }
    } else if (problem.target.kind === "repository-issue") {
      context.repositoryNavigation.focusOrdinaryIssue(problem.target.issueId);
    } else if (problem.target.kind === "repository-runtime") {
      context.repositoryNavigation.focusOrdinaryRepository(
        problem.target.repositoryId,
      );
    } else if (problem.target.kind === "repository-catalog") {
      context.repositoryNavigation.focusCatalog();
    } else if (problem.target.kind === "built-in-issue") {
      context.repositoryNavigation.focusBuiltIn(problem.target.id);
    } else if (problem.target.kind === "built-in-catalog") {
      context.repositoryNavigation.focusCatalog();
    } else if (problem.target.kind === "agent-problem") {
      if (problem.target.sessionId) {
        context.agentNavigation?.selectSession(problem.target.sessionId);
      }
    }

    context.expandPanels();
  });
}
