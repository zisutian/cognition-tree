import { describe, expect, it, vi } from "vitest";
import {
  createDefaultRepositorySelection,
  createRepositoryViewModel,
  projectRepositoryFocusSelection,
  projectRepositoryIssueActions,
  projectRepositoryIssues,
  projectRepositoryLabelIssueMessage,
  projectRepositoryLocation,
  repositorySelectionExists,
  requiresManualLocalDeletion,
} from "../../../application/repository/repositoryViewModel";
import type {
  RepositoryApplication,
  RepositoryPersistenceState,
} from "../../../application/repository/repositoryApplication";
import { remoteRevision } from "../workspace/session/workspaceSessionTestFixture";

function createSource(
  persistence: RepositoryPersistenceState = { status: "saved" },
): RepositoryApplication {
  const descriptor = {
    adapter: "local" as const,
    id: "primary",
    label: "Primary",
    location: {
      hostPath: "/home/zisu/notes/primary",
      serverPath: "/data/repositories/primary",
      type: "local" as const,
    },
    labelIssue: null,
  };
  const reloadBuiltIn = vi.fn(async () => undefined);

  return {
    activeDescriptor: descriptor,
    catalogLabel: "普通仓库",
    catalogState: {
      activeRepositoryId: descriptor.id,
      creatableAdapters: ["local", "webdav"],
      issues: [],
      operation: "idle",
      repositories: [descriptor],
      status: "ready",
    },
    createRepository: vi.fn(async () => undefined),
    deleteRepository: vi.fn(async () => undefined),
    navigation: {
      consumeFocusRequest: vi.fn(),
      focusCatalog: vi.fn(),
      focusOrdinaryIssue: vi.fn(),
      focusOrdinaryRepository: vi.fn(),
      focusRequest: null,
      focusBuiltIn: vi.fn(),
    },
    refreshRepositories: vi.fn(async () => undefined),
    renameRepository: vi.fn(async () => undefined),
    session: {
      discardPendingChangesAndReload: vi.fn(async () => undefined),
      keepLocalConflictAndSynchronize: vi.fn(async () => undefined),
      loadConflictUnitIds: vi.fn(async () => [
        "workspace:note:note-alpha",
      ]),
      persistence,
      recoverLocalConflictCopy: vi.fn(async () => undefined),
      reload: vi.fn(async () => undefined),
      status: "ready",
      storageLabel: "本地仓库",
      useRemoteConflictAndSynchronize: vi.fn(async () => undefined),
    },
    selectRepository: vi.fn(async () => undefined),
    builtIns: {
      catalog: {
        catalogLabel: "内置数据",
        reload: vi.fn(async () => undefined),
        retry: vi.fn(async () => undefined),
        state: {
          issues: [],
          repositories: [
            {
              id: "journal",
              label: "日记",
              location: {
                serverPath: "/state/built-ins/journal/content.json",
                type: "server",
              },
              protected: true,
            },
            {
              id: "todo",
              label: "代办",
              location: {
                serverPath: "/state/built-ins/todo/content.json",
                type: "server",
              },
              protected: true,
            },
          ],
          retryingId: null,
          status: "ready",
        },
      },
      sessions: {
        journal: {
          discardPendingChangesAndReload: vi.fn(async () => undefined),
          keepLocalConflictAndSynchronize: vi.fn(async () => undefined),
          loadConflictUnitIds: vi.fn(async () => ["journal:entry:entry-1"]),
          persistence: { status: "saved" },
          recoverLocalConflictCopy: vi.fn(async () => undefined),
          reload: reloadBuiltIn,
          requestSync: vi.fn(),
          status: "ready",
          useRemoteConflictAndSynchronize: vi.fn(async () => undefined),
        },
        todo: { status: "loading" },
      },
    },
  };
}

describe("repository view model", () => {
  it.each([
    ["conflict", "仓库名称与其他仓库冲突，请在左侧重命名。"],
    ["reserved", "仓库名称由内置仓库保留，请在左侧重命名。"],
    ["nonportable", "仓库名称包含不可移植字符，请在左侧重命名。"],
    [null, ""],
  ] as const)(
    "projects the %s repository label issue precisely",
    (issue, message) => {
      expect(projectRepositoryLabelIssueMessage(issue)).toBe(message);
    },
  );

  it("projects Problems focus targets into the same master-detail selection", () => {
    const view = createRepositoryViewModel(createSource());

    expect(projectRepositoryFocusSelection({
      kind: "catalog",
    })).toEqual({ kind: "create" });
    expect(projectRepositoryFocusSelection({
      id: "broken",
      kind: "ordinary-issue",
    })).toEqual({ id: "broken", kind: "ordinary-issue" });
    expect(projectRepositoryFocusSelection({
      id: "primary",
      kind: "ordinary-repository",
    })).toEqual({ id: "primary", kind: "ordinary-repository" });
    expect(projectRepositoryFocusSelection({
      id: "todo",
      kind: "built-in",
    })).toEqual({ id: "todo", kind: "built-in" });
    expect(createDefaultRepositorySelection(view)).toEqual({
      id: "primary",
      kind: "ordinary-repository",
    });
    expect(createDefaultRepositorySelection({
      activeRepositoryId: null,
      repositories: [],
    })).toEqual({ kind: "create" });
    expect(repositorySelectionExists(
      { id: "primary", kind: "ordinary-repository" },
      view,
    )).toBe(true);
    expect(repositorySelectionExists(
      { id: "missing", kind: "ordinary-repository" },
      view,
    )).toBe(false);
  });

  it("projects each repository location without hiding copyable values", () => {
    expect(projectRepositoryLocation({
      type: "webdav",
      url: "https://dav.example.test/notes/",
    })).toEqual([{
      copyValue: "https://dav.example.test/notes/",
      label: "WebDAV 地址",
      value: "https://dav.example.test/notes/",
    }]);
    expect(projectRepositoryLocation(null)).toEqual([]);
  });

  it("requires manual deletion for unsupported Local layouts and chooses one copyable path", () => {
    const issue = {
      adapter: "local" as const,
      code: "unsupported_repository_version" as const,
      id: "default",
      location: {
        hostPath: "/home/zisu/notes/default",
        serverPath: "/data/repositories/default",
        type: "local" as const,
      },
      message: "Repository version is not supported",
      status: "fault" as const,
    };

    expect(requiresManualLocalDeletion(issue)).toBe(true);
    expect(projectRepositoryIssueActions(issue)).toEqual([]);
    expect(projectRepositoryIssues([issue])).toEqual([{
      ...issue,
      adapterLabel: "本地",
      displayLabel: "default · 本地",
      locationRows: [{
        copyValue: "/home/zisu/notes/default",
        label: "主机路径",
        value: "/home/zisu/notes/default",
      }],
      message: "仓库格式不受支持，需要手工删除该目录。",
    }]);

    const [serverPathOnly] = projectRepositoryIssues([{
      ...issue,
      location: { ...issue.location, hostPath: null },
    }]);

    expect(serverPathOnly?.locationRows).toEqual([{
      copyValue: "/data/repositories/default",
      label: "服务端路径",
      value: "/data/repositories/default",
    }]);
  });

  it("projects repository issue actions by lifecycle and adapter", () => {
    const source = {
      code: "repository_corrupt" as const,
      id: "broken",
      status: "fault" as const,
    };

    expect(projectRepositoryIssueActions({
      ...source,
      adapter: "webdav",
    })).toEqual([{
      confirmation: "将移除故障 WebDAV 连接 broken；远端数据不会被删除。",
      label: "移除连接",
      mode: "remove-connection",
    }]);
    expect(projectRepositoryIssueActions({
      ...source,
      adapter: "local",
    })).toEqual([{
      confirmation: "将删除故障仓库条目 broken。",
      label: "清理",
      mode: "delete-managed-data",
    }]);
    expect(projectRepositoryIssueActions({
      ...source,
      adapter: "webdav",
      status: "deleting",
    })).toEqual([
      {
        confirmation: null,
        label: "重试清理",
        mode: "delete-managed-data",
      },
      {
        confirmation:
          "停止跟踪会保留远端删除标记，并可能留下尚未清理的 generations。",
        label: "停止跟踪",
        mode: "remove-connection",
      },
    ]);
  });

  it.each([
    [{ status: "saved" }, "已保存"],
    [{ status: "saving-local" }, "正在保存本地副本"],
    [{ status: "pending-sync" }, "等待远端同步"],
    [{ status: "syncing" }, "正在同步"],
    [{ pendingChanges: true, status: "offline" }, "离线，等待同步"],
    [
      { remoteRevision: remoteRevision("b"), status: "conflict" },
      "仓库内容已更改",
    ],
    [
      {
        localCopySafe: false,
        message: "local failed",
        phase: "local",
        status: "error",
      },
      "保存失败",
    ],
  ] satisfies Array<[RepositoryPersistenceState, string]>) (
    "maps $0 to its single persistence label",
    (persistence, label) => {
      expect(createRepositoryViewModel(createSource(persistence))).toMatchObject({
        persistenceStatusLabel: label,
      });
    },
  );

  it("projects structured repository locations and conflict actions", () => {
    const source = createSource({
      remoteRevision: remoteRevision("c"),
      status: "conflict",
    });
    const view = createRepositoryViewModel(source);

    expect(view).toMatchObject({
      activeRepositoryId: "primary",
      activeRepositoryLabel: "Primary",
      activeSessionErrorMessage:
        "普通仓库存在同步冲突，本地与远端版本均已保留，请选择处理方式。",
      activeConflictResolution: {
        keepLocal: expect.any(Function),
        loadUnitIds: expect.any(Function),
        recoverLocalCopy: expect.any(Function),
        useRemote: expect.any(Function),
      },
      activeSessionRecoveryAction: null,
      catalogErrorMessage: "",
      catalogStatus: "ready",
      creatableAdapters: [
        { label: "本地", value: "local" },
        { label: "WebDAV", value: "webdav" },
      ],
      deletionBlocked: false,
      deletionWarning: "存在同步冲突；删除会永久丢弃当前本地修改。",
      hasSaveConflict: true,
      issues: [],
      operation: "idle",
      repositories: [
        {
          adapter: "local",
          adapterLabel: "本地",
          displayLabel: "Primary · 本地",
          id: "primary",
          label: "Primary",
          location: {
            hostPath: "/home/zisu/notes/primary",
            serverPath: "/data/repositories/primary",
            type: "local",
          },
          locationRows: [
            {
              copyValue: "/home/zisu/notes/primary",
              label: "主机路径",
              value: "/home/zisu/notes/primary",
            },
            {
              copyValue: "/data/repositories/primary",
              label: "服务端路径",
              value: "/data/repositories/primary",
            },
          ],
          labelIssue: null,
        },
      ],
      persistenceStatusLabel: "仓库内容已更改",
      storageLabel: "本地",
      builtInCatalogErrorMessage: "",
      builtInCatalogStatus: "ready",
      builtInIssues: [],
      builtIns: [
        expect.objectContaining({
          id: "journal",
          label: "日记",
          locationRows: [{
            copyValue: "/state/built-ins/journal/content.json",
            label: "服务端路径",
            value: "/state/built-ins/journal/content.json",
          }],
          protected: true,
          sessionStatus: "ready",
        }),
        expect.objectContaining({
          id: "todo",
          label: "代办",
          protected: true,
          sessionStatus: "loading",
          statusLabel: "正在载入",
        }),
      ],
      retryingBuiltInId: null,
    });
    expect(view.createRepository).toBe(source.createRepository);
    expect(view.deleteRepository).toBe(source.deleteRepository);
    expect(view.refreshRepositories).toBe(source.refreshRepositories);
    expect(view.renameRepository).toBe(source.renameRepository);
    expect(view.selectRepository).toBe(source.selectRepository);
  });

  it("preserves an ordinary session load failure and its retry action", async () => {
    const source = createSource();
    const retry = vi.fn(async () => undefined);

    source.session = {
      errorMessage: "无法读取仓库索引。",
      retry,
      status: "failed",
      storageLabel: "本地仓库",
    };
    const view = createRepositoryViewModel(source);

    expect(view).toMatchObject({
      activeSessionErrorMessage: "无法读取仓库索引。",
      activeSessionRecoveryAction: { label: "重试挂载" },
      persistenceStatusLabel: "挂载失败",
    });
    await view.activeSessionRecoveryAction?.run();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("preserves an ordinary catalog failure for the create recovery detail", () => {
    const source = createSource();

    source.activeDescriptor = null;
    source.catalogState = {
      errorMessage: "无法读取普通仓库目录。",
      status: "failed",
    };
    source.session = { status: "absent" };

    expect(createRepositoryViewModel(source)).toMatchObject({
      activeRepositoryId: null,
      activeSessionErrorMessage: "",
      activeSessionRecoveryAction: null,
      catalogErrorMessage: "无法读取普通仓库目录。",
      catalogStatus: "failed",
      creatableAdapters: [],
      repositories: [],
    });
  });

  it("preserves an ordinary persistence error and reload recovery", async () => {
    const source = createSource({
      localCopySafe: false,
      message: "浏览器存储空间不足。",
      phase: "local",
      status: "error",
    });
    const view = createRepositoryViewModel(source);

    expect(view).toMatchObject({
      activeSessionErrorMessage: "浏览器存储空间不足。",
      activeSessionRecoveryAction: { label: "重新加载" },
      persistenceStatusLabel: "保存失败",
    });
    await view.activeSessionRecoveryAction?.run();
    if (source.session.status !== "ready") {
      throw new Error("Expected a ready ordinary session fixture.");
    }
    expect(source.session.reload).toHaveBeenCalledOnce();
  });

  it("keeps ordinary creation and protected recovery available without an active ordinary repository", () => {
    const source = createSource();

    source.activeDescriptor = null;
    if (source.catalogState.status !== "ready") {
      throw new Error("Expected ready catalog fixture.");
    }
    source.catalogState = {
      ...source.catalogState,
      activeRepositoryId: null,
      repositories: [],
    };
    source.session = { status: "absent" };
    if (source.builtIns.catalog.state.status !== "ready") {
      throw new Error("Expected ready built-in catalog fixture.");
    }
    source.builtIns.catalog.state = {
      ...source.builtIns.catalog.state,
      issues: [{
        code: "repository_corrupt",
        id: "journal",
        location: {
          serverPath: "/state/built-ins/journal/content.json",
          type: "server",
        },
        message: "日记仓库损坏。",
        status: "fault",
      }],
      repositories: source.builtIns.catalog.state.repositories.filter(
        ({ id }) => id !== "journal",
      ),
    };

    const view = createRepositoryViewModel(source);

    expect(view).toMatchObject({
      activeRepositoryId: null,
      activeRepositoryLabel: "尚未选择普通仓库",
      catalogStatus: "ready",
      deletionBlocked: false,
      persistenceStatusLabel: "未挂载",
      repositories: [],
      builtInIssues: [expect.objectContaining({
        displayLabel: "日记 · 内置数据",
        id: "journal",
        label: "日记",
      })],
    });
    expect(view.creatableAdapters).toEqual([
      { label: "本地", value: "local" },
      { label: "WebDAV", value: "webdav" },
    ]);
    expect(view.retryBuiltIn).toBe(
      source.builtIns.catalog.retry,
    );
  });

  it("does not report conflicted or failed built-in persistence as available", async () => {
    const source = createSource();
    const journal = source.builtIns.sessions["journal"];

    if (journal.status !== "ready") {
      throw new Error("Expected ready journal fixture.");
    }
    journal.persistence = {
      remoteRevision: "sha256:remote-journal",
      status: "conflict",
    };
    let view = createRepositoryViewModel(source);
    let projectedJournal = view.builtIns.find(
      ({ id }) => id === "journal",
    );

    expect(projectedJournal).toMatchObject({
      conflictResolution: {
        keepLocal: expect.any(Function),
        loadUnitIds: expect.any(Function),
        recoverLocalCopy: expect.any(Function),
        useRemote: expect.any(Function),
      },
      hasProblem: true,
      recoveryAction: null,
      statusLabel: "同步冲突",
    });
    await projectedJournal?.conflictResolution?.keepLocal();
    expect(journal.keepLocalConflictAndSynchronize).toHaveBeenCalledOnce();

    journal.persistence = {
      localCopySafe: true,
      message: "remote sync failed",
      phase: "sync",
      status: "error",
    };
    view = createRepositoryViewModel(source);
    projectedJournal = view.builtIns.find(
      ({ id }) => id === "journal",
    );

    expect(projectedJournal).toMatchObject({
      errorMessage: "remote sync failed",
      hasProblem: true,
      statusLabel: "同步失败",
      recoveryAction: { label: "重试同步" },
    });
    await projectedJournal?.recoveryAction?.run();
    expect(journal.requestSync).toHaveBeenCalledOnce();
  });

  it("cannot let offline state overwrite a local persistence error", () => {
    const localError: RepositoryPersistenceState = {
      localCopySafe: false,
      message: "Client cache is full",
      phase: "local",
      status: "error",
    };

    expect(createRepositoryViewModel(createSource(localError))).toMatchObject({
      deletionBlocked: true,
      deletionWarning: "本地副本尚未安全保存，当前不能删除仓库。",
      hasSaveConflict: false,
      persistenceStatusLabel: "保存失败",
    });
  });
});
