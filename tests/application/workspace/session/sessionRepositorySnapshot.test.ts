import { describe, expect, it } from "vitest";
import type { WorkspaceRepository } from "../../../../application/repository/workspaceRepository";
import { createInitialWorkspaceData } from "../../../../core/workspace/model/workspaceData";
import { loadWorkspaceSessionSnapshot } from "../../../../application/workspace/session/sessionRepositorySnapshot";
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
    keepLocalConflictAndSynchronize: async () => {
      throw new Error("Unexpected conflict resolution in snapshot test.");
    },
    label: "test repository",
    loadConflict: async () => null,
    loadSnapshot: async () => snapshot,
    location: {
      hostPath: null,
      serverPath: "/repositories/test",
      type: "local",
    },
    resolveConflictAndSynchronize: async () => {
      throw new Error("Unexpected conflict resolution in snapshot test.");
    },
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

  it("rejects malformed canonical metadata at repository preparation", () => {
    const content = createContent();
    expect(() => createSnapshot({
      content: {
        ...content,
        workspace: {
          ...content.workspace,
          notes: [{ id: "note-1", source: "Raw title" }],
        },
      },
    })).toThrow("expected @ctn-block directive");
  });

  it("still rejects a damaged title header when syntax is not configured", () => {
    const content = createContent();
    expect(() => createSnapshot({
      content: {
        ...content,
        syntax: { activeFileId: null, files: [] },
        workspace: {
          ...content.workspace,
          notes: [{ id: "note-1", source: "Raw title\nopaque body" }],
        },
      },
    })).toThrow("expected @ctn-block directive");
  });
});
