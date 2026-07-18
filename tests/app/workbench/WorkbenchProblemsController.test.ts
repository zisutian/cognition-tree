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
      repositoryIssues: [repositoryIssue],
    })).toMatchObject({
      errorCount: 1,
      problems: [
        expect.objectContaining({ id: "repository:broken" }),
        diagnostic,
      ],
      warningCount: 1,
    });
    expect(selectWorkbenchProblems({
      activeActivityId: "settings",
      diagnostics,
      repositoryIssues: [repositoryIssue],
    })).toEqual({
      errorCount: 0,
      problems: [diagnostic],
      status: "ready",
      warningCount: 1,
    });
  });

  it("requests the matching repository issue before opening Repositories", () => {
    const onActiveActivityChange = vi.fn();
    const openRepositoryIssue = vi.fn();
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
      navigation: {
        openNoteLine: vi.fn(),
        openRepositoryIssue,
        openSyntaxField: vi.fn(),
      },
      onActiveActivityChange,
    });

    expect(onActiveActivityChange).toHaveBeenCalledWith("repository");
    expect(openRepositoryIssue).toHaveBeenCalledWith("broken");
    expect(openRepositoryIssue.mock.invocationCallOrder[0]).toBeLessThan(
      onActiveActivityChange.mock.invocationCallOrder[0] ?? 0,
    );
    expect(expandPanels).toHaveBeenCalledOnce();
  });
});
