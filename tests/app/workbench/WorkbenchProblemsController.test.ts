import { describe, expect, it, vi } from "vitest";
import {
  hasWorkbenchProblemsPanel,
  openWorkbenchProblem,
  selectWorkbenchProblems,
} from "../../../src/app/workbench/WorkbenchProblemsController";
import {
  createUiWorkbenchDiagnostics,
  type UiWorkbenchDiagnostic,
} from "../../../src/application/workspace/projection/viewDiagnostics";
import type { UiWorkbenchRepositoryProblem } from "../../../src/application/problems/workbenchProblems";
import type { JournalDiagnostic } from "../../../src/application/journal";
import type { SystemRepositoryIssue } from "../../../src/storage/repository/systemRepository";
import type { WorkspaceRepositoryCatalogIssue } from "../../../src/storage/repository/workspaceRepositoryCatalog";

const diagnostic: UiWorkbenchDiagnostic = {
  code: "unknown-syntax",
  id: "document:note-1:unknown-syntax",
  locationLabel: "示例 · L2:C2",
  message: "笔记存在未知语法。",
  severity: "warning",
  source: "document",
  target: { kind: "note-line", lineNumber: 2, noteId: "note-1" },
};

const repositoryIssue: WorkspaceRepositoryCatalogIssue = {
  adapter: "local",
  code: "repository_corrupt",
  id: "broken",
  location: null,
  message: "仓库元数据损坏。",
  status: "fault",
};

const systemIssue: SystemRepositoryIssue = {
  code: "repository_corrupt",
  id: "system-journal",
  location: { serverPath: "/state/system-journal.json", type: "server" },
  message: "日记仓库损坏。",
  status: "fault",
};

const journalDiagnostic: JournalDiagnostic = {
  code: "unknown-syntax",
  id: "journal:document:journal-entry-00000000-0000-4000-8000-000000000001:unknown-syntax",
  locationLabel: "2026-01-02 11:04:05 · L3:C1",
  message: "日记正文存在未知语法。",
  severity: "error",
  source: "document",
  target: {
    entryId: "journal-entry-00000000-0000-4000-8000-000000000001",
    kind: "journal-entry-line",
    lineNumber: 3,
  },
};

describe("WorkbenchProblemsController", () => {
  it("omits the global problems panel from Todo and Settings", () => {
    expect(hasWorkbenchProblemsPanel("settings")).toBe(false);
    expect(hasWorkbenchProblemsPanel("todo")).toBe(false);
    expect(hasWorkbenchProblemsPanel("journal")).toBe(true);
    expect(hasWorkbenchProblemsPanel("repository")).toBe(true);
    expect(hasWorkbenchProblemsPanel("notes")).toBe(true);
  });

  it("shows only Journal diagnostics in Journal and excludes them elsewhere", () => {
    const diagnostics = createUiWorkbenchDiagnostics([diagnostic], "ready");
    const journalDiagnostics = {
      diagnostics: [journalDiagnostic],
      errorCount: 1,
      status: "ready" as const,
      warningCount: 0,
    };

    expect(selectWorkbenchProblems({
      activeActivityId: "journal",
      diagnostics,
      journalDiagnostics,
      repositories: [],
      repositoryIssues: [repositoryIssue],
      systemIssues: [systemIssue],
    })).toEqual({
      errorCount: 1,
      problems: [journalDiagnostic],
      status: "ready",
      warningCount: 0,
    });
    expect(selectWorkbenchProblems({
      activeActivityId: "notes",
      diagnostics,
      journalDiagnostics,
      repositories: [],
      repositoryIssues: [repositoryIssue],
      systemIssues: [systemIssue],
    }).problems).toEqual([diagnostic]);
    expect(selectWorkbenchProblems({
      activeActivityId: "repository",
      diagnostics,
      journalDiagnostics,
      repositories: [],
      repositoryIssues: [repositoryIssue],
      systemIssues: [systemIssue],
    }).problems).not.toContain(journalDiagnostic);
  });

  it("includes repository problems only for repositories and retains diagnostics there", () => {
    const diagnostics = createUiWorkbenchDiagnostics([diagnostic], "ready");

    expect(selectWorkbenchProblems({
      activeActivityId: "repository",
      diagnostics,
      repositories: [],
      repositoryIssues: [repositoryIssue],
      systemIssues: [systemIssue],
    })).toMatchObject({
      errorCount: 2,
      problems: [
        expect.objectContaining({ id: "repository:broken" }),
        expect.objectContaining({ id: "system-repository:system-journal" }),
        diagnostic,
      ],
      warningCount: 1,
    });
    expect(selectWorkbenchProblems({
      activeActivityId: "settings",
      diagnostics,
      repositories: [],
      repositoryIssues: [repositoryIssue],
      systemIssues: [systemIssue],
    })).toEqual({
      errorCount: 0,
      problems: [diagnostic],
      status: "ready",
      warningCount: 1,
    });
    expect(selectWorkbenchProblems({
      activeActivityId: "notes",
      diagnostics,
      repositories: [],
      repositoryIssues: [repositoryIssue],
      systemIssues: [systemIssue],
    })).toEqual({
      errorCount: 0,
      problems: [diagnostic],
      status: "ready",
      warningCount: 1,
    });
  });

  it("requests the matching repository issue before opening Repositories", () => {
    const onActiveActivityChange = vi.fn();
    const focusOrdinaryIssue = vi.fn();
    const expandPanels = vi.fn();
    const problem: UiWorkbenchRepositoryProblem = {
      code: repositoryIssue.code,
      id: "repository:broken",
      locationLabel: "本地 · broken",
      message: repositoryIssue.message,
      severity: "error",
      source: "repository",
      target: { issueId: "broken", kind: "repository-issue" },
    };

    openWorkbenchProblem(problem, {
      expandPanels,
      repositoryNavigation: {
        consumeFocusRequest: vi.fn(),
        focusOrdinaryIssue,
        focusOrdinaryRepository: vi.fn(),
        focusRequest: null,
        focusSystemRepository: vi.fn(),
      },
      workspaceNavigation: {
        openNoteLine: vi.fn(),
        openSyntaxField: vi.fn(),
      },
      onActiveActivityChange,
    });

    expect(onActiveActivityChange).toHaveBeenCalledWith("repository");
    expect(focusOrdinaryIssue).toHaveBeenCalledWith("broken");
    expect(focusOrdinaryIssue.mock.invocationCallOrder[0]).toBeLessThan(
      onActiveActivityChange.mock.invocationCallOrder[0] ?? 0,
    );
    expect(expandPanels).toHaveBeenCalledOnce();
  });

  it("activates the diagnostic syntax file before opening its field", () => {
    const onActiveActivityChange = vi.fn();
    const openSyntaxField = vi.fn();
    const expandPanels = vi.fn();
    const problem: UiWorkbenchDiagnostic = {
      code: "required",
      id: "syntax:syntax-secondary:required:$.name",
      locationLabel: "备用语法 · 语法名称",
      message: "语法名称不能为空。",
      severity: "error",
      source: "syntax",
      target: {
        fieldId: "syntax-profile-name",
        kind: "syntax-field",
        path: "$.name",
        syntaxFileId: "syntax-secondary",
      },
    };

    openWorkbenchProblem(problem, {
      expandPanels,
      repositoryNavigation: {
        consumeFocusRequest: vi.fn(),
        focusOrdinaryIssue: vi.fn(),
        focusOrdinaryRepository: vi.fn(),
        focusRequest: null,
        focusSystemRepository: vi.fn(),
      },
      workspaceNavigation: {
        openNoteLine: vi.fn(),
        openSyntaxField,
      },
      onActiveActivityChange,
    });

    expect(openSyntaxField).toHaveBeenCalledWith(
      "syntax-secondary",
      "syntax-profile-name",
    );
    expect(onActiveActivityChange).toHaveBeenCalledWith("syntax");
    expect(openSyntaxField.mock.invocationCallOrder[0]).toBeLessThan(
      onActiveActivityChange.mock.invocationCallOrder[0] ?? 0,
    );
    expect(expandPanels).toHaveBeenCalledOnce();
  });

  it("selects the Journal entry and body line before opening Journal", () => {
    const expandPanels = vi.fn();
    const onActiveActivityChange = vi.fn();
    const openEntryLine = vi.fn();

    openWorkbenchProblem(journalDiagnostic, {
      expandPanels,
      journalNavigation: { openEntryLine },
      repositoryNavigation: {
        consumeFocusRequest: vi.fn(),
        focusOrdinaryIssue: vi.fn(),
        focusOrdinaryRepository: vi.fn(),
        focusRequest: null,
        focusSystemRepository: vi.fn(),
      },
      workspaceNavigation: null,
      onActiveActivityChange,
    });

    expect(openEntryLine).toHaveBeenCalledWith(
      journalDiagnostic.target.entryId,
      journalDiagnostic.target.lineNumber,
    );
    expect(onActiveActivityChange).toHaveBeenCalledWith("journal");
    expect(openEntryLine.mock.invocationCallOrder[0]).toBeLessThan(
      onActiveActivityChange.mock.invocationCallOrder[0] ?? 0,
    );
    expect(expandPanels).toHaveBeenCalledOnce();
  });

  it("focuses the conflicted ordinary row or protected system row before opening Repositories", () => {
    const onActiveActivityChange = vi.fn();
    const focusOrdinaryRepository = vi.fn();
    const focusSystemRepository = vi.fn();
    const context = {
      expandPanels: vi.fn(),
      repositoryNavigation: {
        consumeFocusRequest: vi.fn(),
        focusOrdinaryIssue: vi.fn(),
        focusOrdinaryRepository,
        focusRequest: null,
        focusSystemRepository,
      },
      workspaceNavigation: null,
      onActiveActivityChange,
    };

    openWorkbenchProblem({
      code: "repository-name-conflict",
      id: "repository-name-conflict:primary",
      locationLabel: "本地 · 日记",
      message: "仓库名称冲突。",
      severity: "error",
      source: "repository",
      target: {
        kind: "repository-name-conflict",
        repositoryId: "primary",
      },
    }, context);
    openWorkbenchProblem({
      code: systemIssue.code,
      id: "system-repository:system-journal",
      locationLabel: "内置 · 日记",
      message: systemIssue.message,
      severity: "error",
      source: "repository",
      target: {
        kind: "system-repository-issue",
        purpose: "system-journal",
      },
    }, context);

    expect(focusOrdinaryRepository).toHaveBeenCalledWith("primary");
    expect(focusSystemRepository).toHaveBeenCalledWith("system-journal");
    expect(onActiveActivityChange).toHaveBeenNthCalledWith(1, "repository");
    expect(onActiveActivityChange).toHaveBeenNthCalledWith(2, "repository");
  });
});
