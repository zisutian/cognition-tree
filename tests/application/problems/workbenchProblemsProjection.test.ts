// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type { JournalDiagnostic } from
  "../../../application/journal/journalDiagnostics";
import {
  type UiWorkbenchOperationalProblem,
} from "../../../application/workbench/problems/workbenchProblems";
import {
  projectWorkbenchProblems,
  selectWorkbenchProblems,
} from "../../../application/workbench/problems/workbenchProblemsProjection";
import type { BuiltInRuntimeIssue } from
  "../../../application/repository/projectBuiltInIssues";
import type { WorkspaceRepositoryRuntimeIssue } from
  "../../../application/repository/projectWorkspaceRepositoryIssues";
import type { RepositoryApplication } from
  "../../../application/repository/repositoryApplication";
import type { TodoDiagnostic } from
  "../../../application/todo/todoDiagnostics";
import {
  createUiWorkbenchDiagnostics,
  type UiWorkbenchDiagnostic,
} from "../../../application/workspace/projection/viewDiagnostics";
import type {
  WorkspaceRepositoryCatalogIssue,
} from "../../../application/repository/workspaceRepositoryCatalog";

const workspaceDiagnostic: UiWorkbenchDiagnostic = {
  code: "unknown-syntax",
  id: "document:note-1:unknown-syntax",
  locationLabel: "示例 · L2:C2",
  message: "笔记存在未知语法。",
  severity: "warning",
  source: "document",
  target: { kind: "note-line", lineNumber: 2, noteId: "note-1" },
};

const journalDiagnostic: JournalDiagnostic = {
  code: "unknown-syntax",
  id: "journal:document:entry-1:unknown-syntax",
  locationLabel: "2026-01-02-0001 · L3:C1",
  message: "日记正文存在未知语法。",
  severity: "error",
  source: "document",
  target: {
    entryId: "journal-entry-00000000-0000-4000-8000-000000000001",
    kind: "journal-entry-line",
    lineNumber: 3,
  },
};

const todoDiagnostic: TodoDiagnostic = {
  code: "missing-todo-marker",
  id: "todo:document:collection-1:missing",
  locationLabel: "收集箱 · L2:C1",
  message: "代办正文必须使用已配置的代办行首符号。",
  severity: "error",
  source: "document",
  target: {
    collectionId: "todo-collection-00000000-0000-4000-8000-000000000001",
    kind: "todo-collection-line",
    lineNumber: 2,
  },
};

const systemSyntaxDiagnostic: UiWorkbenchDiagnostic = {
  code: "required",
  id: "syntax:journal:required:body.label",
  locationLabel: "日记语法 · 顶格正文 · 名称",
  message: "顶格正文名称不能为空。",
  severity: "error",
  source: "syntax",
  target: {
    fieldId: "syntax-top-level-unmarked-rule",
    kind: "system-syntax",
    owner: "journal",
    path: "body.label",
  },
};

const repositoryIssue: WorkspaceRepositoryCatalogIssue = {
  code: "repository_corrupt",
  id: "broken",
  location: null,
  message: "仓库元数据损坏。",
};

const builtInIssue: BuiltInRuntimeIssue = {
  code: "repository_corrupt",
  id: "journal",
  kind: "data",
  location: { serverPath: "/data/journal", type: "server" },
  message: "日记仓库损坏。",
  status: "fault",
};

const repositoryRuntimeIssues: WorkspaceRepositoryRuntimeIssue[] = [{
  code: "repository_catalog_failed",
  kind: "catalog",
  message: "普通仓库目录不可用。",
}];

const workspaceDiagnostics = createUiWorkbenchDiagnostics(
  [workspaceDiagnostic],
  "ready",
);

function select(
  overrides: Partial<Parameters<typeof selectWorkbenchProblems>[0]> = {},
) {
  return selectWorkbenchProblems({
    builtInIssues: [builtInIssue],
    diagnostics: workspaceDiagnostics,
    repositories: [],
    repositoryIssues: [repositoryIssue],
    repositoryRuntimeIssues,
    ...overrides,
  });
}

describe("workbench problems projection", () => {
  it("combines Journal, Todo, and Syntax diagnostics into the global view", () => {
    const journal = select({
      journalDiagnostics: {
        diagnostics: [journalDiagnostic],
        errorCount: 1,
        status: "ready",
        warningCount: 0,
      },
    }).problems;
    const todo = select({
      todoDiagnostics: {
        diagnostics: [todoDiagnostic],
        errorCount: 1,
        status: "ready",
        warningCount: 0,
      },
    }).problems;
    const syntax = select({
      syntaxDiagnostics: {
        diagnostics: [systemSyntaxDiagnostic],
        status: "ready",
      },
    }).problems;

    expect(journal).toHaveLength(5);
    expect(journal).toEqual(expect.arrayContaining([
      journalDiagnostic,
      workspaceDiagnostic,
      expect.objectContaining({ id: "built-in:journal" }),
    ]));
    expect(todo).toHaveLength(5);
    expect(todo).toEqual(expect.arrayContaining([
      todoDiagnostic,
      workspaceDiagnostic,
      expect.objectContaining({ id: "repository:broken" }),
    ]));
    expect(syntax).toHaveLength(5);
    expect(syntax).toEqual(expect.arrayContaining([
      systemSyntaxDiagnostic,
      workspaceDiagnostic,
      expect.objectContaining({ id: "repository-runtime:catalog" }),
    ]));
  });

  it("returns repository diagnostics in the global state", () => {
    const expected = [
      expect.objectContaining({ id: "repository:broken" }),
      expect.objectContaining({ id: "built-in:journal" }),
      expect.objectContaining({ id: "repository-runtime:catalog" }),
      workspaceDiagnostic,
    ];

    expect(select().problems).toEqual(expected);
  });

  it("shows operational problems globally without changing their recovery target", () => {
    const operationalProblem: UiWorkbenchOperationalProblem = {
      code: "unexpected_client_error",
      details: {},
      firstOccurredAt: "2026-08-26T00:00:00.000Z",
      id: "operation:failure-1",
      lastOccurredAt: "2026-08-26T00:00:00.000Z",
      locationLabel: "代办",
      message: "删除集合失败。",
      occurrenceCount: 1,
      path: null,
      requestId: null,
      retryable: false,
      severity: "error",
      source: "ui-action",
      target: {
        kind: "operational-error",
        problemId: "failure-1",
        sessionId: null,
        sourceScope: "todo",
      },
    };

    const problems = select({
      builtInIssues: [],
      operationalProblems: [operationalProblem],
    }).problems;

    expect(problems).toContain(operationalProblem);
    expect(operationalProblem.target.sourceScope).toBe("todo");
  });

  it("derives repository and operational problems in one application projection", () => {
    const repository = {
      activeDescriptor: null,
      builtIns: {
        catalog: {
          state: {
            issues: [{
              code: "repository_corrupt",
              id: "journal",
              location: { serverPath: "/data/journal", type: "server" },
              message: "日记仓库损坏。",
              status: "fault",
            }],
            repositories: [],
            status: "ready",
          },
        },
        sessions: {
          journal: { status: "unavailable" },
          todo: { status: "unavailable" },
        },
      },
      catalogState: {
        issues: [repositoryIssue],
        repositories: [],
        status: "ready",
      },
      session: { status: "absent" },
    } as unknown as RepositoryApplication;
    const problems = projectWorkbenchProblems({
      diagnostics: workspaceDiagnostics,
      feedbackErrors: [{
        code: "unexpected_client_error",
        details: {},
        firstOccurredAt: "2026-08-26T00:00:00.000Z",
        id: "failure-1",
        lastOccurredAt: "2026-08-26T00:00:00.000Z",
        message: "刷新失败。",
        occurrenceCount: 1,
        path: null,
        requestId: null,
        retryable: false,
        sequence: 1,
        severity: "error",
        source: "ui-action",
        target: { scope: "repository", sessionId: null },
      }],
      getScopeLabel: () => "仓库",
      repository,
    });

    expect(problems.problems).toEqual([
      expect.objectContaining({ id: "repository:broken" }),
      expect.objectContaining({ id: "operation:failure-1" }),
      expect.objectContaining({ id: "built-in:journal" }),
      workspaceDiagnostic,
    ]);
  });
});
