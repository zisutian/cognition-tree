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
import type { UiWorkbenchRepositoryProblem } from "../../../src/application/workspace/projection/viewProblems";
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

describe("WorkbenchProblemsController", () => {
  it("omits the global problems panel only from Settings", () => {
    expect(hasWorkbenchProblemsPanel("settings")).toBe(false);
    expect(hasWorkbenchProblemsPanel("repository")).toBe(true);
    expect(hasWorkbenchProblemsPanel("notes")).toBe(true);
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
