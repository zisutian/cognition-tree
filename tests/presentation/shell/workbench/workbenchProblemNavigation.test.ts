// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import type { UiWorkbenchProblem } from "../../../../application/workbench/problems/workbenchProblems";
import {
  openWorkbenchProblem,
  type WorkbenchProblemOpenContext,
} from "../../../../presentation/shell/workbench/workbenchProblemNavigation";

function createContext() {
  return {
    expandPanels: vi.fn(),
    journalNavigation: { openEntryLine: vi.fn() },
    onActiveActivityChange: vi.fn((_activity: string, apply?: () => void) => {
      apply?.();
    }),
    repositoryNavigation: {
      consumeFocusRequest: vi.fn(),
      focusBuiltIn: vi.fn(),
      focusCatalog: vi.fn(),
      focusOrdinaryIssue: vi.fn(),
      focusOrdinaryRepository: vi.fn(),
      focusRequest: null,
    },
    syntaxNavigation: { openSystemSyntax: vi.fn() },
    todoNavigation: {
      openCollectionLine: vi.fn(),
      selectCollection: vi.fn(),
    },
    workspaceNavigation: {
      openNoteLine: vi.fn(),
      openPortableName: vi.fn(),
      openSyntaxField: vi.fn(),
    },
  } satisfies WorkbenchProblemOpenContext;
}

function problem(target: UiWorkbenchProblem["target"]): UiWorkbenchProblem {
  return {
    code: "unknown-syntax",
    id: `problem:${target.kind}`,
    locationLabel: "目标",
    message: "问题",
    severity: "error",
    source: "document",
    target,
  } as UiWorkbenchProblem;
}

describe("workbench problem navigation adapter", () => {
  it("routes note, Journal, and Todo lines within the approved navigation", () => {
    const context = createContext();

    openWorkbenchProblem(
      problem({
        kind: "note-line",
        lineNumber: 2,
        noteId: "note-1",
      }),
      context,
    );
    openWorkbenchProblem(
      problem({
        entryId: "journal-entry-00000000-0000-4000-8000-000000000001",
        kind: "journal-entry-line",
        lineNumber: 3,
      }),
      context,
    );
    openWorkbenchProblem(
      problem({
        collectionId: "todo-collection-00000000-0000-4000-8000-000000000001",
        kind: "todo-collection-line",
        lineNumber: 4,
      }),
      context,
    );

    expect(context.workspaceNavigation.openNoteLine).toHaveBeenCalledWith(
      "note-1",
      2,
    );
    expect(context.journalNavigation.openEntryLine).toHaveBeenCalledWith(
      "journal-entry-00000000-0000-4000-8000-000000000001",
      3,
    );
    expect(context.todoNavigation.openCollectionLine).toHaveBeenCalledWith(
      "todo-collection-00000000-0000-4000-8000-000000000001",
      4,
    );
    expect(
      context.onActiveActivityChange.mock.calls.map(([activity]) => [activity]),
    ).toEqual([["notes"], ["journal"], ["todo"]]);
    expect(
      context.workspaceNavigation.openNoteLine.mock.invocationCallOrder[0],
    ).toBeGreaterThan(
      context.onActiveActivityChange.mock.invocationCallOrder[0] ?? 0,
    );
    expect(context.expandPanels).toHaveBeenCalledTimes(3);
  });

  it("routes workspace and system syntax targets", () => {
    const context = createContext();

    openWorkbenchProblem(
      problem({
        fieldId: "syntax-profile-name",
        kind: "syntax-field",
        path: "$.name",
        syntaxFileId: "syntax-a",
      }),
      context,
    );
    openWorkbenchProblem(
      problem({
        fieldId: "syntax-root",
        kind: "system-syntax",
        owner: "journal",
        path: "$.name",
      }),
      context,
    );

    expect(context.workspaceNavigation.openSyntaxField).toHaveBeenCalledWith(
      "syntax-a",
      "syntax-profile-name",
    );
    expect(context.syntaxNavigation.openSystemSyntax).toHaveBeenCalledWith(
      "journal",
      "syntax-root",
    );
    expect(context.onActiveActivityChange).toHaveBeenNthCalledWith(
      1,
      "syntax",
      expect.any(Function),
    );
    expect(context.onActiveActivityChange).toHaveBeenNthCalledWith(
      2,
      "syntax",
      expect.any(Function),
    );
  });

  it("routes each portable-name owner to its management adapter", () => {
    const context = createContext();

    openWorkbenchProblem(
      problem({
        entity: "note",
        kind: "portable-name",
        noteId: "note-1",
        owner: "workspace",
      }),
      context,
    );
    openWorkbenchProblem(
      problem({
        collectionId: "todo-collection-00000000-0000-4000-8000-000000000001",
        entity: "collection",
        kind: "portable-name",
        owner: "todo",
      }),
      context,
    );
    openWorkbenchProblem(
      problem({
        entity: "repository",
        kind: "portable-name",
        owner: "repository",
        repositoryId: "repository-a",
      }),
      context,
    );

    expect(context.workspaceNavigation.openPortableName).toHaveBeenCalledWith({
      entity: "note",
      noteId: "note-1",
    });
    expect(context.todoNavigation.selectCollection).toHaveBeenCalledOnce();
    expect(
      context.repositoryNavigation.focusOrdinaryRepository,
    ).toHaveBeenCalledWith("repository-a");
    expect(
      context.onActiveActivityChange.mock.calls.map(([activity]) => [activity]),
    ).toEqual([["notes"], ["todo"], ["repository"]]);
  });

  it("routes repository issue kinds without exposing them to application projection", () => {
    const context = createContext();

    openWorkbenchProblem(
      problem({
        issueId: "broken",
        kind: "repository-issue",
      }),
      context,
    );
    openWorkbenchProblem(
      problem({
        kind: "repository-runtime",
        repositoryId: "repository-a",
      }),
      context,
    );
    openWorkbenchProblem(problem({ kind: "repository-catalog" }), context);
    openWorkbenchProblem(
      problem({
        id: "journal",
        kind: "built-in-issue",
      }),
      context,
    );

    expect(
      context.repositoryNavigation.focusOrdinaryIssue,
    ).toHaveBeenCalledWith("broken");
    expect(
      context.repositoryNavigation.focusOrdinaryRepository,
    ).toHaveBeenCalledWith("repository-a");
    expect(context.repositoryNavigation.focusCatalog).toHaveBeenCalledOnce();
    expect(context.repositoryNavigation.focusBuiltIn).toHaveBeenCalledWith(
      "journal",
    );
    expect(context.onActiveActivityChange).toHaveBeenCalledTimes(4);
  });

  it("routes operational errors only when their scope is an Activity", () => {
    const context = createContext();

    openWorkbenchProblem(
      problem({
        kind: "operational-error",
        problemId: "failure-1",
        sessionId: null,
        sourceScope: "todo",
      }),
      context,
    );
    openWorkbenchProblem(
      problem({
        kind: "operational-error",
        problemId: "failure-2",
        sessionId: null,
        sourceScope: "unknown",
      }),
      context,
    );

    expect(context.onActiveActivityChange).toHaveBeenCalledOnce();
    expect(context.onActiveActivityChange).toHaveBeenCalledWith(
      "todo",
      expect.any(Function),
    );
    expect(context.expandPanels).toHaveBeenCalledOnce();
  });
});
