import { describe, expect, it, vi } from "vitest";
import {
  hasWorkbenchProblemsPanel,
  openWorkbenchProblem,
  selectWorkbenchProblems,
} from "../../../presentation/shell/workbench/WorkbenchProblemsController";
import {
  createUiWorkbenchDiagnostics,
  type UiWorkbenchDiagnostic,
} from "../../../application/workspace/projection/viewDiagnostics";
import type { UiWorkbenchRepositoryProblem } from "../../../application/problems/workbenchProblems";
import type { JournalDiagnostic } from "../../../application/journal";
import type { TodoDiagnostic } from "../../../application/todo";
import type { BuiltInRuntimeIssue } from "../../../application/repository/projectBuiltInIssues";
import type { WorkspaceRepositoryRuntimeIssue } from "../../../application/repository/projectWorkspaceRepositoryIssues";
import type { WorkspaceRepositoryCatalogIssue } from "../../../application/repository/workspaceRepositoryCatalog";

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

const builtInIssue: BuiltInRuntimeIssue = {
  code: "repository_corrupt",
  id: "journal",
  kind: "data",
  location: {
    serverPath: "/state/built-ins/journal/content.json",
    type: "server",
  },
  message: "日记仓库损坏。",
  status: "fault",
};

const repositoryRuntimeIssues: WorkspaceRepositoryRuntimeIssue[] = [
  {
    code: "repository_catalog_failed",
    kind: "catalog",
    message: "普通仓库目录不可用。",
  },
  {
    adapter: "local",
    code: "session_load_failed",
    kind: "repository",
    message: "无法载入主要笔记。",
    repositoryId: "primary",
    repositoryLabel: "主要笔记",
  },
];

const journalDiagnostic: JournalDiagnostic = {
  code: "unknown-syntax",
  id: "journal:document:journal-entry-00000000-0000-4000-8000-000000000001:unknown-syntax",
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
  id: "todo:document:todo-collection-00000000-0000-4000-8000-000000000001:missing",
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

const workspaceNameDiagnostic: UiWorkbenchDiagnostic = {
  code: "nonportable-workspace-note-name",
  id: "portable-name:workspace:note:note-old",
  locationLabel: "笔记 · 旧:标题",
  message: "笔记名称包含不可移植字符，请手工重命名。",
  severity: "error",
  source: "name",
  target: {
    entity: "note",
    kind: "portable-name",
    noteId: "note-old",
    owner: "workspace",
  },
};

const todoNameDiagnostic: TodoDiagnostic = {
  code: "nonportable-todo-collection-name",
  id: "todo:name:todo-collection-00000000-0000-4000-8000-000000000001",
  locationLabel: "旧:集合",
  message: "事项集合名称包含不可移植字符，请手工重命名。",
  severity: "error",
  source: "name",
  target: {
    collectionId: "todo-collection-00000000-0000-4000-8000-000000000001",
    entity: "collection",
    kind: "portable-name",
    owner: "todo",
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

describe("WorkbenchProblemsController", () => {
  it("omits the global problems panel only from Settings", () => {
    expect(hasWorkbenchProblemsPanel("settings")).toBe(false);
    expect(hasWorkbenchProblemsPanel("todo")).toBe(true);
    expect(hasWorkbenchProblemsPanel("journal")).toBe(true);
    expect(hasWorkbenchProblemsPanel("repository")).toBe(true);
    expect(hasWorkbenchProblemsPanel("notes")).toBe(true);
  });

  it("shows only Todo diagnostics in Todo", () => {
    expect(selectWorkbenchProblems({
      activeActivityId: "todo",
      diagnostics: createUiWorkbenchDiagnostics([diagnostic], "ready"),
      repositories: [],
      repositoryIssues: [repositoryIssue],
      builtInIssues: [builtInIssue],
      todoDiagnostics: {
        diagnostics: [todoDiagnostic],
        errorCount: 1,
        status: "ready",
        warningCount: 0,
      },
    })).toEqual({
      errorCount: 1,
      problems: [todoDiagnostic],
      status: "ready",
      warningCount: 0,
    });
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
      builtInIssues: [builtInIssue],
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
      builtInIssues: [builtInIssue],
    }).problems).toEqual([diagnostic]);
    expect(selectWorkbenchProblems({
      activeActivityId: "repository",
      diagnostics,
      journalDiagnostics,
      repositories: [],
      repositoryIssues: [repositoryIssue],
      builtInIssues: [builtInIssue],
    }).problems).not.toContain(journalDiagnostic);
  });

  it("uses the selected owner projection in Syntax", () => {
    const diagnostics = createUiWorkbenchDiagnostics([diagnostic], "ready");

    expect(selectWorkbenchProblems({
      activeActivityId: "syntax",
      diagnostics,
      repositories: [],
      repositoryIssues: [],
      syntaxDiagnostics: {
        diagnostics: [systemSyntaxDiagnostic],
        status: "ready",
      },
      builtInIssues: [],
    })).toEqual({
      errorCount: 1,
      problems: [systemSyntaxDiagnostic],
      status: "ready",
      warningCount: 0,
    });
  });

  it("selects and focuses a system syntax problem before opening Syntax", () => {
    const openSystemSyntax = vi.fn();
    const onActiveActivityChange = vi.fn();

    openWorkbenchProblem(systemSyntaxDiagnostic, {
      expandPanels: vi.fn(),
      onActiveActivityChange,
      repositoryNavigation: {
        consumeFocusRequest: vi.fn(),
        focusCatalog: vi.fn(),
        focusOrdinaryIssue: vi.fn(),
        focusOrdinaryRepository: vi.fn(),
        focusRequest: null,
        focusBuiltIn: vi.fn(),
      },
      syntaxNavigation: { openSystemSyntax },
      workspaceNavigation: null,
    });

    expect(openSystemSyntax).toHaveBeenCalledWith(
      "journal",
      "syntax-top-level-unmarked-rule",
    );
    expect(onActiveActivityChange).toHaveBeenCalledWith("syntax");
  });

  it("includes repository problems only for repositories and retains diagnostics there", () => {
    const diagnostics = createUiWorkbenchDiagnostics([diagnostic], "ready");

    expect(selectWorkbenchProblems({
      activeActivityId: "repository",
      diagnostics,
      repositories: [],
      repositoryIssues: [repositoryIssue],
      builtInIssues: [builtInIssue],
    })).toMatchObject({
      errorCount: 2,
      problems: [
        expect.objectContaining({ id: "repository:broken" }),
        expect.objectContaining({ id: "built-in:journal" }),
        diagnostic,
      ],
      warningCount: 1,
    });
    expect(selectWorkbenchProblems({
      activeActivityId: "settings",
      diagnostics,
      repositories: [],
      repositoryIssues: [repositoryIssue],
      builtInIssues: [builtInIssue],
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
      builtInIssues: [builtInIssue],
    })).toEqual({
      errorCount: 0,
      problems: [diagnostic],
      status: "ready",
      warningCount: 1,
    });
  });

  it("includes ordinary runtime failures only in Repository Problems", () => {
    const diagnostics = createUiWorkbenchDiagnostics([], "ready");

    expect(selectWorkbenchProblems({
      activeActivityId: "repository",
      diagnostics,
      repositories: [],
      repositoryIssues: [],
      repositoryRuntimeIssues,
      builtInIssues: [],
    })).toMatchObject({
      errorCount: 2,
      problems: [
        expect.objectContaining({ target: { kind: "repository-runtime", repositoryId: "primary" } }),
        expect.objectContaining({ target: { kind: "repository-catalog" } }),
      ],
      warningCount: 0,
    });
    expect(selectWorkbenchProblems({
      activeActivityId: "notes",
      diagnostics,
      repositories: [],
      repositoryIssues: [],
      repositoryRuntimeIssues,
      builtInIssues: [],
    }).problems).toEqual([]);
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
        focusCatalog: vi.fn(),
        focusOrdinaryIssue,
        focusOrdinaryRepository: vi.fn(),
        focusRequest: null,
        focusBuiltIn: vi.fn(),
      },
      workspaceNavigation: {
        openNoteLine: vi.fn(),
        openPortableName: vi.fn(),
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

  it("focuses an ordinary failed session or the catalog recovery detail", () => {
    const onActiveActivityChange = vi.fn();
    const focusCatalog = vi.fn();
    const focusOrdinaryRepository = vi.fn();
    const context = {
      expandPanels: vi.fn(),
      repositoryNavigation: {
        consumeFocusRequest: vi.fn(),
        focusCatalog,
        focusOrdinaryIssue: vi.fn(),
        focusOrdinaryRepository,
        focusRequest: null,
        focusBuiltIn: vi.fn(),
      },
      workspaceNavigation: null,
      onActiveActivityChange,
    };
    const runtimeProblem: UiWorkbenchRepositoryProblem = {
      code: "session_load_failed",
      id: "repository-runtime:primary",
      locationLabel: "本地 · 主要笔记",
      message: "无法载入主要笔记。",
      severity: "error",
      source: "repository",
      target: { kind: "repository-runtime", repositoryId: "primary" },
    };
    const catalogProblem: UiWorkbenchRepositoryProblem = {
      code: "repository_catalog_failed",
      id: "repository-runtime:catalog",
      locationLabel: "普通仓库 · 目录",
      message: "普通仓库目录不可用。",
      severity: "error",
      source: "repository",
      target: { kind: "repository-catalog" },
    };

    openWorkbenchProblem(runtimeProblem, context);
    openWorkbenchProblem(catalogProblem, context);

    expect(focusOrdinaryRepository).toHaveBeenCalledWith("primary");
    expect(focusCatalog).toHaveBeenCalledOnce();
    expect(onActiveActivityChange).toHaveBeenNthCalledWith(1, "repository");
    expect(onActiveActivityChange).toHaveBeenNthCalledWith(2, "repository");
    expect(context.expandPanels).toHaveBeenCalledTimes(2);
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
        focusCatalog: vi.fn(),
        focusOrdinaryIssue: vi.fn(),
        focusOrdinaryRepository: vi.fn(),
        focusRequest: null,
        focusBuiltIn: vi.fn(),
      },
      workspaceNavigation: {
        openNoteLine: vi.fn(),
        openPortableName: vi.fn(),
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
        focusCatalog: vi.fn(),
        focusOrdinaryIssue: vi.fn(),
        focusOrdinaryRepository: vi.fn(),
        focusRequest: null,
        focusBuiltIn: vi.fn(),
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

  it("selects the Todo collection and body line before opening Todo", () => {
    const expandPanels = vi.fn();
    const onActiveActivityChange = vi.fn();
    const openCollectionLine = vi.fn();

    openWorkbenchProblem(todoDiagnostic, {
      expandPanels,
      repositoryNavigation: {
        consumeFocusRequest: vi.fn(),
        focusCatalog: vi.fn(),
        focusOrdinaryIssue: vi.fn(),
        focusOrdinaryRepository: vi.fn(),
        focusRequest: null,
        focusBuiltIn: vi.fn(),
      },
      todoNavigation: { openCollectionLine, selectCollection: vi.fn() },
      workspaceNavigation: null,
      onActiveActivityChange,
    });

    if (todoDiagnostic.target.kind !== "todo-collection-line") {
      throw new Error("todo fixture must target a collection line");
    }
    expect(openCollectionLine).toHaveBeenCalledWith(
      todoDiagnostic.target.collectionId,
      todoDiagnostic.target.lineNumber,
    );
    expect(onActiveActivityChange).toHaveBeenCalledWith("todo");
    expect(expandPanels).toHaveBeenCalledOnce();
  });

  it("selects portable-name owners before opening their management activity", () => {
    const onActiveActivityChange = vi.fn();
    const openPortableName = vi.fn();
    const selectCollection = vi.fn();
    const context = {
      expandPanels: vi.fn(),
      repositoryNavigation: {
        consumeFocusRequest: vi.fn(),
        focusCatalog: vi.fn(),
        focusOrdinaryIssue: vi.fn(),
        focusOrdinaryRepository: vi.fn(),
        focusRequest: null,
        focusBuiltIn: vi.fn(),
      },
      todoNavigation: {
        openCollectionLine: vi.fn(),
        selectCollection,
      },
      workspaceNavigation: {
        openNoteLine: vi.fn(),
        openPortableName,
        openSyntaxField: vi.fn(),
      },
      onActiveActivityChange,
    };

    openWorkbenchProblem(workspaceNameDiagnostic, context);
    openWorkbenchProblem(todoNameDiagnostic, context);

    expect(openPortableName).toHaveBeenCalledWith({
      entity: "note",
      noteId: "note-old",
    });
    expect(selectCollection).toHaveBeenCalledWith(
      "todo-collection-00000000-0000-4000-8000-000000000001",
    );
    expect(onActiveActivityChange).toHaveBeenNthCalledWith(1, "notes");
    expect(onActiveActivityChange).toHaveBeenNthCalledWith(2, "todo");
  });

  it("focuses the conflicted ordinary row or protected system row before opening Repositories", () => {
    const onActiveActivityChange = vi.fn();
    const focusOrdinaryRepository = vi.fn();
    const focusBuiltIn = vi.fn();
    const context = {
      expandPanels: vi.fn(),
      repositoryNavigation: {
        consumeFocusRequest: vi.fn(),
        focusCatalog: vi.fn(),
        focusOrdinaryIssue: vi.fn(),
        focusOrdinaryRepository,
        focusRequest: null,
        focusBuiltIn,
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
        entity: "repository",
        kind: "portable-name",
        owner: "repository",
        repositoryId: "primary",
      },
    }, context);
    openWorkbenchProblem({
      code: builtInIssue.code,
      id: "built-in:journal",
      locationLabel: "内置数据 · 日记",
      message: builtInIssue.message,
      severity: "error",
      source: "repository",
      target: {
        kind: "built-in-issue",
        id: "journal",
      },
    }, context);

    expect(focusOrdinaryRepository).toHaveBeenCalledWith("primary");
    expect(focusBuiltIn).toHaveBeenCalledWith("journal");
    expect(onActiveActivityChange).toHaveBeenNthCalledWith(1, "repository");
    expect(onActiveActivityChange).toHaveBeenNthCalledWith(2, "repository");
  });
});
