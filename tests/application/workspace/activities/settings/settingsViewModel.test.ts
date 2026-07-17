import { describe, expect, it, vi } from "vitest";
import { createSettingsViewModel } from "../../../../../src/application/workspace/activities/settings/settingsViewModel";
import type { WorkspacePersistenceState } from "../../../../../src/application/workspace/session/workspaceSessionSaveQueue";
import { remoteRevision } from "../../session/workspaceSessionTestFixture";

function createSource(
  persistence: WorkspacePersistenceState = { status: "saved" },
): Parameters<typeof createSettingsViewModel>[0] {
  return {
    activeRepositoryId: "primary",
    creatableAdapters: ["local", "webdav"],
    createRepository: vi.fn(async () => undefined),
    deleteRepository: vi.fn(async () => undefined),
    discardPendingChangesAndReload: vi.fn(async () => undefined),
    issues: [],
    locationLabel: "本机仓库 / primary",
    operation: "idle",
    persistence,
    reload: vi.fn(async () => undefined),
    repositories: [
      {
        adapter: "local",
        id: "primary",
        label: "Primary",
        locationLabel: "本机仓库 / primary",
      },
    ],
    storageLabel: "本地仓库",
    selectRepository: vi.fn(async () => undefined),
  };
}

describe("settings view model", () => {
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
      expect(createSettingsViewModel(createSource(persistence))).toMatchObject({
        persistenceStatusLabel: label,
      });
    },
  );

  it("projects a non-sensitive location label and conflict actions", () => {
    const source = createSource({
      remoteRevision: remoteRevision("c"),
      status: "conflict",
    });

    expect(createSettingsViewModel(source)).toEqual({
      activeRepositoryId: "primary",
      activeRepositoryLabel: "Primary",
      creatableAdapters: [
        { label: "本地", value: "local" },
        { label: "WebDAV", value: "webdav" },
      ],
      createRepository: source.createRepository,
      deleteRepository: source.deleteRepository,
      deletionBlocked: false,
      deletionWarning: "存在同步冲突；删除会永久丢弃当前本地修改。",
      discardPendingChangesAndReload: source.discardPendingChangesAndReload,
      hasSaveConflict: true,
      issues: [],
      locationLabel: "本机仓库 / primary",
      operation: "idle",
      reload: source.reload,
      repositories: [
        {
          adapter: "local",
          adapterLabel: "本地",
          displayLabel: "Primary · 本地",
          id: "primary",
          label: "Primary",
          locationLabel: "本机仓库 / primary",
        },
      ],
      persistenceStatusLabel: "仓库内容已更改",
      storageLabel: "本地",
      selectRepository: source.selectRepository,
    });
  });

  it("cannot let offline state overwrite a local persistence error", () => {
    const localError: WorkspacePersistenceState = {
      localCopySafe: false,
      message: "IndexedDB is full",
      phase: "local",
      status: "error",
    };

    expect(createSettingsViewModel(createSource(localError))).toMatchObject({
      deletionBlocked: true,
      deletionWarning: "本地副本尚未安全保存，当前不能删除仓库。",
      hasSaveConflict: false,
      persistenceStatusLabel: "保存失败",
    });
  });
});
