import { describe, expect, it } from "vitest";
import type { WorkspaceRepository } from "../../../../src/storage/repository/workspaceRepository";
import { createInitialWorkspaceData } from "../../../../src/workspace/model/workspaceData";
import { loadWorkspaceSessionSnapshot } from "../../../../src/application/workspace/session/sessionRepositorySnapshot";
import {
  createContent,
  createSnapshot,
  draftRevision,
  remoteRevision,
} from "./workspaceSessionTestFixture";

function createRepository(
  snapshot: Awaited<ReturnType<WorkspaceRepository["loadSnapshot"]>>,
): WorkspaceRepository {
  return {
    discardPendingSnapshotAndReload: async () => snapshot,
    label: "test repository",
    loadSnapshot: async () => snapshot,
    location: { databaseName: "test", type: "browser" },
    stageSnapshot: async () => ({ localRevision: snapshot.localRevision }),
    subscribeReconnect: () => () => undefined,
    synchronizePendingSnapshot: async () => ({
      localRevision: snapshot.localRevision,
      pendingChanges: snapshot.pendingChanges,
      remoteRevision: snapshot.remoteRevision,
      status: "synced",
    }),
  };
}

describe("loadWorkspaceSessionSnapshot", () => {
  it("loads one v4 content snapshot and resolves its active syntax profile", async () => {
    const snapshot = createSnapshot();

    await expect(
      loadWorkspaceSessionSnapshot(createRepository(snapshot)),
    ).resolves.toMatchObject({
      content: snapshot.content,
      localRevision: draftRevision("initial"),
      pendingChanges: false,
      remoteRevision: remoteRevision("a"),
      workspaceSyntax: {
        source: snapshot.content.syntax.files[0]?.source,
      },
    });
  });

  it("keeps an unconfigured repository syntax explicit", async () => {
    const snapshot = createSnapshot({
      content: {
        schemaVersion: 4,
        syntax: { activeFileId: null, files: [] },
        workspace: createInitialWorkspaceData(),
      },
      remoteRevision: null,
    });

    await expect(
      loadWorkspaceSessionSnapshot(createRepository(snapshot)),
    ).resolves.toEqual({
      ...snapshot,
      workspaceSyntax: null,
    });
  });

  it("loads invalid note text as diagnostics when canonical metadata remains valid", async () => {
    const snapshot = createSnapshot({
      content: createContent(
        "可修复工作区",
        "标题\n\t``` 未闭合\n\t正文",
      ),
    });

    await expect(
      loadWorkspaceSessionSnapshot(createRepository(snapshot)),
    ).resolves.toMatchObject({ content: snapshot.content });
  });

  it("rejects only a malformed canonical metadata structure", async () => {
    const content = createContent();
    const snapshot = createSnapshot({
      content: {
        ...content,
        workspace: {
          ...content.workspace,
          notes: [{ id: "note-1", source: "Raw title" }],
        },
      },
    });

    await expect(
      loadWorkspaceSessionSnapshot(createRepository(snapshot)),
    ).rejects.toThrow("expected @ctn-block directive");
  });

  it("still rejects a damaged title header when syntax is not configured", async () => {
    const content = createContent();
    const snapshot = createSnapshot({
      content: {
        ...content,
        syntax: { activeFileId: null, files: [] },
        workspace: {
          ...content.workspace,
          notes: [{ id: "note-1", source: "Raw title\nopaque body" }],
        },
      },
    });

    await expect(
      loadWorkspaceSessionSnapshot(createRepository(snapshot)),
    ).rejects.toThrow("expected @ctn-block directive");
  });
});
