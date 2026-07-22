import { describe, expect, it } from "vitest";
import {
  createUiWorkbenchProblems,
  projectUiRepositoryLabelProblems,
  projectUiRepositoryProblems,
  projectUiSystemRepositoryProblems,
  projectUiWorkspaceRepositoryRuntimeProblems,
} from "../../../src/application/problems/workbenchProblems";
import type { WorkspaceRepositoryRuntimeIssue } from "../../../src/application/repository/projectWorkspaceRepositoryIssues";
import {
  createUiWorkbenchDiagnostics,
  type UiWorkbenchDiagnostic,
} from "../../../src/application/workspace/projection/viewDiagnostics";
import type { SystemRepositoryIssue } from "../../../src/storage/repository/systemRepository";
import type {
  WorkspaceRepositoryCatalogIssue,
  WorkspaceRepositoryDescriptor,
} from "../../../src/storage/repository/workspaceRepositoryCatalog";

const diagnostic: UiWorkbenchDiagnostic = {
  code: "unknown-syntax",
  id: "document:note-1:unknown-syntax",
  locationLabel: "本地 · zzz",
  message: "笔记存在未知语法。",
  severity: "warning",
  source: "document",
  target: { kind: "note-line", lineNumber: 2, noteId: "note-1" },
};

const issues: WorkspaceRepositoryCatalogIssue[] = [
  {
    adapter: "local",
    code: "repository_corrupt",
    id: "aaa",
    location: null,
    message: "仓库元数据损坏。",
    status: "fault",
  },
  {
    adapter: "local",
    code: "repository_busy",
    id: "bbb",
    location: null,
    message: "正在清理仓库。",
    status: "deleting",
  },
];

const repositories: WorkspaceRepositoryDescriptor[] = [{
  adapter: "local",
  id: "conflicted",
  label: "日记",
  location: {
    hostPath: null,
    serverPath: "/data/repositories/conflicted",
    type: "local",
  },
  labelIssue: "conflict",
}];

const systemIssues: SystemRepositoryIssue[] = [{
  code: "repository_corrupt",
  id: "system-journal",
  location: { serverPath: "/state/system-journal.json", type: "server" },
  message: "日记仓库损坏。",
  status: "fault",
}];

const runtimeIssues: WorkspaceRepositoryRuntimeIssue[] = [
  {
    code: "repository_catalog_failed",
    kind: "catalog",
    message: "普通仓库目录不可用。",
  },
  {
    adapter: "local",
    code: "session_load_failed",
    kind: "repository",
    message: "仓库内容载入失败。",
    repositoryId: "conflicted",
    repositoryLabel: "日记",
  },
];

describe("workbench problem projection", () => {
  it("maps fault issues to errors and deleting issues to warnings", () => {
    expect(projectUiRepositoryProblems(issues)).toEqual([
      expect.objectContaining({
        id: "repository:aaa",
        locationLabel: "本地 · aaa",
        severity: "error",
        source: "repository",
        target: { issueId: "aaa", kind: "repository-issue" },
      }),
      expect.objectContaining({
        id: "repository:bbb",
        locationLabel: "本地 · bbb",
        severity: "warning",
        source: "repository",
        target: { issueId: "bbb", kind: "repository-issue" },
      }),
    ]);
  });

  it("turns an unsupported Local layout into manual-removal guidance", () => {
    expect(projectUiRepositoryProblems([{
      adapter: "local",
      code: "unsupported_repository_version",
      id: "default",
      location: {
        hostPath: "/host/repositories/default",
        serverPath: "/data/repositories/default",
        type: "local",
      },
      message: "Repository version is not supported",
      status: "fault",
    }])).toEqual([
      expect.objectContaining({
        id: "repository:default",
        message: "仓库格式不受支持，需要手工删除该目录。",
        severity: "error",
      }),
    ]);
  });

  it("projects ordinary name conflicts and protected system faults with distinct focus targets", () => {
    expect(projectUiRepositoryLabelProblems(repositories)).toEqual([
      expect.objectContaining({
        code: "repository-name-conflict",
        id: "repository-label-conflict:conflicted",
        locationLabel: "本地 · 日记",
        severity: "error",
        target: {
          entity: "repository",
          kind: "portable-name",
          owner: "repository",
          repositoryId: "conflicted",
        },
      }),
    ]);
    expect(projectUiSystemRepositoryProblems(systemIssues)).toEqual([
      expect.objectContaining({
        id: "system-repository:system-journal",
        locationLabel: "内置 · 日记",
        severity: "error",
        target: {
          kind: "system-repository-issue",
          purpose: "system-journal",
        },
      }),
    ]);
    expect(projectUiSystemRepositoryProblems([{
      code: "system_repository_catalog_failed",
      id: "system-journal",
      location: null,
      message: "内置仓库目录不可用。",
      status: "fault",
    }])).toEqual([
      expect.objectContaining({
        id: "system-repository:catalog",
        locationLabel: "内置仓库 · 目录",
        target: {
          kind: "system-repository-issue",
          purpose: "system-journal",
        },
      }),
    ]);
  });

  it("projects ordinary catalog and session failures to recoverable Repository targets", () => {
    expect(projectUiWorkspaceRepositoryRuntimeProblems(runtimeIssues)).toEqual([
      {
        code: "repository_catalog_failed",
        id: "repository-runtime:catalog",
        locationLabel: "普通仓库 · 目录",
        message: "普通仓库目录不可用。",
        severity: "error",
        source: "repository",
        target: { kind: "repository-catalog" },
      },
      {
        code: "session_load_failed",
        id: "repository-runtime:conflicted",
        locationLabel: "本地 · 日记",
        message: "仓库内容载入失败。",
        severity: "error",
        source: "repository",
        target: {
          kind: "repository-runtime",
          repositoryId: "conflicted",
        },
      },
    ]);
  });

  it("merges repository problems without mutating or replacing diagnostics", () => {
    const diagnostics = createUiWorkbenchDiagnostics(
      [diagnostic],
      "collecting",
    );

    expect(createUiWorkbenchProblems(
      diagnostics,
      issues,
      repositories,
      systemIssues,
      runtimeIssues,
    )).toEqual({
      errorCount: 5,
      problems: [
        expect.objectContaining({ id: "repository-label-conflict:conflicted" }),
        expect.objectContaining({ id: "repository-runtime:conflicted" }),
        expect.objectContaining({ id: "repository:aaa" }),
        expect.objectContaining({ id: "system-repository:system-journal" }),
        expect.objectContaining({ id: "repository-runtime:catalog" }),
        expect.objectContaining({ id: "repository:bbb" }),
        diagnostic,
      ],
      status: "collecting",
      warningCount: 2,
    });
    expect(diagnostics.diagnostics).toEqual([diagnostic]);
  });
});
