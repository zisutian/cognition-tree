import { describe, expect, it } from "vitest";
import type { JournalDiagnostic } from "../../../../../application/journal/journalDiagnostics";
import type { TodoDiagnostic } from "../../../../../application/todo/todoDiagnostics";
import { createSyntaxActivityDiagnostics } from "../../../../../application/problems/syntaxActivityDiagnostics";
import type { UiWorkbenchDiagnostic } from "../../../../../application/workspace/projection/viewDiagnostics";

const profileDiagnostic: UiWorkbenchDiagnostic = {
  code: "required",
  id: "profile",
  locationLabel: "语法 · 名称",
  message: "名称不能为空。",
  severity: "error",
  source: "syntax",
  target: {
    fieldId: "syntax-profile-name",
    kind: "syntax-field",
    path: "$.name",
    syntaxFileId: "syntax-b",
  },
};
const workspaceDiagnostic: UiWorkbenchDiagnostic = {
  code: "unknown-syntax",
  id: "workspace",
  locationLabel: "笔记 · L2",
  message: "未知语法。",
  severity: "warning",
  source: "document",
  target: { kind: "note-line", lineNumber: 2, noteId: "note-a" },
};
const journalDiagnostic: JournalDiagnostic = {
  code: "unresolved-journal-reference",
  id: "journal",
  locationLabel: "2026-01-02-0001 · L1",
  message: "无法解析引用。",
  severity: "warning",
  source: "reference",
  target: {
    entryId: "journal-entry-a",
    kind: "journal-entry-line",
    lineNumber: 1,
  },
};
const todoDiagnostic: TodoDiagnostic = {
  code: "missing-todo-marker",
  id: "todo",
  locationLabel: "今天 · L1",
  message: "缺少代办符号。",
  severity: "error",
  source: "document",
  target: {
    collectionId: "todo-collection-a",
    kind: "todo-collection-line",
    lineNumber: 1,
  },
};

const journalDiagnostics = {
  diagnostics: [journalDiagnostic],
  errorCount: 0,
  status: "ready" as const,
  warningCount: 1,
};
const todoDiagnostics = {
  diagnostics: [todoDiagnostic],
  errorCount: 1,
  status: "ready" as const,
  warningCount: 0,
};
const workspaceDiagnostics = {
  diagnostics: [workspaceDiagnostic],
  errorCount: 0,
  status: "collecting" as const,
  warningCount: 1,
};

describe("syntax activity diagnostics", () => {
  it("adds workspace diagnostics only for the active workspace syntax", () => {
    expect(createSyntaxActivityDiagnostics({
      activeWorkspaceFileId: "syntax-a",
      journalDiagnostics,
      profileDiagnostics: [profileDiagnostic],
      selectedTarget: { fileId: "syntax-b", kind: "workspace-file" },
      todoDiagnostics,
      workspaceDiagnostics,
    })).toEqual({ diagnostics: [profileDiagnostic], status: "ready" });

    expect(createSyntaxActivityDiagnostics({
      activeWorkspaceFileId: "syntax-b",
      journalDiagnostics,
      profileDiagnostics: [profileDiagnostic],
      selectedTarget: { fileId: "syntax-b", kind: "workspace-file" },
      todoDiagnostics,
      workspaceDiagnostics,
    })).toEqual({
      diagnostics: [profileDiagnostic, workspaceDiagnostic],
      status: "collecting",
    });
  });

  it("scopes system diagnostics to the selected owner", () => {
    expect(createSyntaxActivityDiagnostics({
      activeWorkspaceFileId: "syntax-a",
      journalDiagnostics,
      profileDiagnostics: [],
      selectedTarget: { kind: "journal" },
      todoDiagnostics,
      workspaceDiagnostics,
    }).diagnostics).toEqual([journalDiagnostic]);
    expect(createSyntaxActivityDiagnostics({
      activeWorkspaceFileId: "syntax-a",
      journalDiagnostics,
      profileDiagnostics: [],
      selectedTarget: { kind: "todo" },
      todoDiagnostics,
      workspaceDiagnostics,
    }).diagnostics).toEqual([todoDiagnostic]);
  });
});
