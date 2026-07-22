import { describe, expect, it, vi } from "vitest";
import {
  createRepositoryViewModel,
  projectRepositoryIssueActions,
  projectRepositoryIssues,
  projectRepositoryLocation,
  requiresManualLocalDeletion,
} from "../../../../../src/application/workspace/activities/repository/repositoryViewModel";
import type { RepositoryApplication } from "../../../../../src/application/repository/repositoryApplication";
import type { WorkspacePersistenceState } from "../../../../../src/application/workspace/session/workspaceSessionSaveQueue";
import { remoteRevision } from "../../session/workspaceSessionTestFixture";
import { createEmptySystemRepositoryContent } from "../../../../../contracts/system-repository/parseRepository";

function createSource(
  persistence: WorkspacePersistenceState = { status: "saved" },
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
  const reloadSystemRepository = vi.fn(async () => undefined);
  const journalContent = createEmptySystemRepositoryContent("system-journal");

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
      focusOrdinaryIssue: vi.fn(),
      focusOrdinaryRepository: vi.fn(),
      focusRequest: null,
      focusSystemRepository: vi.fn(),
    },
    refreshRepositories: vi.fn(async () => undefined),
    renameRepository: vi.fn(async () => undefined),
    session: {
      discardPendingChangesAndReload: vi.fn(async () => undefined),
      persistence,
      reload: vi.fn(async () => undefined),
      status: "ready",
      storageLabel: "本地仓库",
    },
    selectRepository: vi.fn(async () => undefined),
    systems: {
      catalog: {
        catalogLabel: "内置仓库",
        reload: vi.fn(async () => undefined),
        retryRepository: vi.fn(async () => undefined),
        state: {
          issues: [],
          repositories: [
            {
              id: "system-journal",
              label: "日记",
              location: {
                serverPath: "/state/system-journal.json",
                type: "server",
              },
              protected: true,
            },
            {
              id: "system-todo",
              label: "代办",
              location: {
                serverPath: "/state/system-todo.json",
                type: "server",
              },
              protected: true,
            },
          ],
          retryingPurpose: null,
          status: "ready",
        },
      },
      repositories: {},
      sessions: {
        "system-journal": {
          discardPendingChangesAndReload: vi.fn(async () => undefined),
          flushPendingChanges: vi.fn(async () => undefined),
          reload: reloadSystemRepository,
          repository: null,
          requestSync: vi.fn(),
          state: {
            content: journalContent,
            persistence: { status: "saved" },
            purpose: "system-journal",
            snapshot: {
              conflictRevision: null,
              content: journalContent,
              localRevision: "draft:journal",
              pendingChanges: false,
              remoteRevision: "sha256:journal",
            },
            status: "ready",
          },
          updateContent: vi.fn(),
        },
        "system-todo": {
          discardPendingChangesAndReload: vi.fn(async () => undefined),
          flushPendingChanges: vi.fn(async () => undefined),
          reload: reloadSystemRepository,
          repository: null,
          requestSync: vi.fn(),
          state: { purpose: "system-todo", status: "loading" },
          updateContent: vi.fn(),
        },
      },
    },
  };
}

describe("repository view model", () => {
  it("projects each repository location without hiding copyable values", () => {
    expect(projectRepositoryLocation({
      type: "webdav",
      url: "https://dav.example.test/notes/",
    })).toEqual([{
      copyValue: "https://dav.example.test/notes/",
      label: "WebDAV 地址",
      value: "https://dav.example.test/notes/",
    }]);
    expect(projectRepositoryLocation({
      databaseName: "cognition-tree-v3",
      type: "browser",
    })).toEqual([{
      copyValue: "cognition-tree-v3",
      label: "浏览器数据库",
      value: "cognition-tree-v3",
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
  ] satisfies Array<[WorkspacePersistenceState, string]>) (
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
      systemCatalogErrorMessage: "",
      systemCatalogStatus: "ready",
      systemIssues: [],
      systemRepositories: [
        expect.objectContaining({
          id: "system-journal",
          label: "日记",
          locationRows: [{
            copyValue: "/state/system-journal.json",
            label: "服务端路径",
            value: "/state/system-journal.json",
          }],
          protected: true,
          sessionStatus: "ready",
        }),
        expect.objectContaining({
          id: "system-todo",
          label: "代办",
          protected: true,
          sessionStatus: "loading",
          statusLabel: "正在载入",
        }),
      ],
      retryingSystemPurpose: null,
    });
    expect(view.createRepository).toBe(source.createRepository);
    expect(view.deleteRepository).toBe(source.deleteRepository);
    expect(view.refreshRepositories).toBe(source.refreshRepositories);
    expect(view.renameRepository).toBe(source.renameRepository);
    expect(view.selectRepository).toBe(source.selectRepository);
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
    if (source.systems.catalog.state.status !== "ready") {
      throw new Error("Expected ready system catalog fixture.");
    }
    source.systems.catalog.state = {
      ...source.systems.catalog.state,
      issues: [{
        code: "repository_corrupt",
        id: "system-journal",
        location: {
          serverPath: "/state/system-journal.json",
          type: "server",
        },
        message: "日记仓库损坏。",
        status: "fault",
      }],
      repositories: source.systems.catalog.state.repositories.filter(
        ({ id }) => id !== "system-journal",
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
      systemIssues: [expect.objectContaining({
        displayLabel: "日记 · 内置仓库",
        id: "system-journal",
        label: "日记",
      })],
    });
    expect(view.creatableAdapters).toEqual([
      { label: "本地", value: "local" },
      { label: "WebDAV", value: "webdav" },
    ]);
    expect(view.retrySystemRepository).toBe(
      source.systems.catalog.retryRepository,
    );
  });

  it("does not report conflicted or failed system persistence as available", async () => {
    const source = createSource();
    const journal = source.systems.sessions["system-journal"];

    if (journal.state.status !== "ready") {
      throw new Error("Expected ready journal fixture.");
    }
    journal.state = {
      ...journal.state,
      persistence: {
        remoteRevision: "sha256:remote-journal",
        status: "conflict",
      },
    };
    let view = createRepositoryViewModel(source);
    let projectedJournal = view.systemRepositories.find(
      ({ id }) => id === "system-journal",
    );

    expect(projectedJournal).toMatchObject({
      hasProblem: true,
      statusLabel: "同步冲突",
      recoveryAction: {
        label: "放弃本地修改并重新加载",
      },
    });
    await projectedJournal?.recoveryAction?.run();
    expect(journal.discardPendingChangesAndReload).toHaveBeenCalledOnce();

    journal.state = {
      ...journal.state,
      persistence: {
        localCopySafe: true,
        message: "remote sync failed",
        phase: "sync",
        status: "error",
      },
    };
    view = createRepositoryViewModel(source);
    projectedJournal = view.systemRepositories.find(
      ({ id }) => id === "system-journal",
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
    const localError: WorkspacePersistenceState = {
      localCopySafe: false,
      message: "IndexedDB is full",
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
