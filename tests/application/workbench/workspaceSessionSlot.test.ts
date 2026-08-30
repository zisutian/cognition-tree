// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../application/workspace/persistence/workspaceRepository";
import type { WorkspaceRepositoryDescriptor } from "../../../application/repository/workspaceRepositoryCatalog";
import { createWorkspaceSessionSlot } from "../../../application/workbench/workspaceSessionSlot";
import {
  createContent,
  createSnapshot,
  draftRevision,
  remoteRevision,
} from "../workspace/session/workspaceSessionTestFixture";
import { testApplicationScheduler } from "../../support/testApplicationScheduler";

function createRepository(label: string): WorkspaceRepository {
  let snapshot = createSnapshot({ content: createContent(label) });
  let localRevisionIndex = 0;

  return {
    discardPendingSnapshotAndReload: async () => snapshot,
    keepLocalConflictAndSynchronize: async () => {
      throw new Error("Unexpected conflict resolution in session slot test.");
    },
    label,
    loadConflict: async () => null,
    loadSnapshot: async () => snapshot,
    location: {
      hostPath: null,
      serverPath: `/repositories/${label}`,
    },
    resolveConflictAndSynchronize: async () => {
      throw new Error("Unexpected conflict resolution in session slot test.");
    },
    stageSnapshot: async (change) => {
      const previousLocalRevision = snapshot.localRevision;

      snapshot = {
        ...snapshot,
        content: change.after.content,
        localRevision: draftRevision(`next-${localRevisionIndex += 1}`),
        pendingChanges: true,
        projection: change.after.projection,
      };
      return { previousLocalRevision, snapshot };
    },
    subscribeReconnect: () => () => undefined,
    synchronizePendingSnapshot: async () => {
      const previousLocalRevision = snapshot.localRevision;

      snapshot = {
        ...snapshot,
        pendingChanges: false,
        remoteRevision: remoteRevision("b"),
      };
      return {
        status: "synced",
        transitions: [{ previousLocalRevision, snapshot }],
      };
    },
  };
}

describe("workspace session slot", () => {
  it("reuses one repository connection and owns replacement lifecycle", async () => {
    const repositoryA = createRepository("A");
    const repositoryB = createRepository("B");
    const descriptorA: WorkspaceRepositoryDescriptor = {
      id: "repository-a",
      label: "A",
      labelIssue: null,
      location: repositoryA.location,
    };
    const descriptorB: WorkspaceRepositoryDescriptor = {
      ...descriptorA,
      id: "repository-b",
      label: "B",
      location: repositoryB.location,
    };
    const openRepository = vi.fn((descriptor: WorkspaceRepositoryDescriptor) =>
      descriptor.id === descriptorA.id ? repositoryA : repositoryB
    );
    const onChange = vi.fn();
    const slot = createWorkspaceSessionSlot({
      commandDependencies: {
        createBlockId: () => "00000000-0000-4000-8000-000000000001",
        createFolderId: () => "folder-created",
        createNoteId: () => "note-created",
        createSyntaxFileId: () =>
          "syntax-00000000-0000-4000-8000-000000000002",
        now: () => "2026-07-23T00:00:00.000Z",
      },
      onChange,
      repositories: { openRepository },
      scheduler: testApplicationScheduler,
    });

    slot.reconcile(descriptorA);
    const first = slot.getController();

    expect(slot.getSnapshot().status).toBe("loading");
    slot.start();
    await vi.waitFor(() => expect(slot.getSnapshot().status).toBe("ready"));
    const synchronizePendingChanges = vi.spyOn(
      first!,
      "synchronizePendingChanges",
    );

    await slot.synchronizeReady();
    expect(synchronizePendingChanges).toHaveBeenCalledOnce();

    slot.reconcile({ ...descriptorA, label: "Renamed" });
    expect(slot.getController()).toBe(first);
    expect(openRepository).toHaveBeenCalledTimes(1);

    const disposeFirst = vi.spyOn(first!, "dispose");

    slot.reconcile(descriptorB);
    expect(disposeFirst).toHaveBeenCalledOnce();
    expect(slot.getController()).not.toBe(first);
    await vi.waitFor(() => expect(slot.getSnapshot().status).toBe("ready"));
    expect(onChange).toHaveBeenCalled();
    expect(openRepository).toHaveBeenCalledTimes(2);

    slot.dispose();
    expect(slot.getSnapshot().status).toBe("absent");
  });
});
