// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../application/repository/workspaceRepository";
import { createWorkspaceSessionSlot } from "../../../application/workbench/workspaceSessionSlot";
import {
  createContent,
  createSnapshot,
  draftRevision,
  remoteRevision,
} from "../workspace/session/workspaceSessionTestFixture";
import { testApplicationScheduler } from "../../support/testApplicationScheduler";

function createRepository(label: string): WorkspaceRepository {
  const snapshot = createSnapshot({ content: createContent(label) });

  return {
    discardPendingSnapshotAndReload: async () => snapshot,
    label,
    loadSnapshot: async () => snapshot,
    location: { databaseName: label, type: "browser" },
    stageSnapshot: async () => ({ localRevision: draftRevision("next") }),
    subscribeReconnect: () => () => undefined,
    synchronizePendingSnapshot: async () => ({
      localRevision: draftRevision("next"),
      pendingChanges: false,
      remoteRevision: remoteRevision("b"),
      status: "synced",
    }),
  };
}

describe("workspace session slot", () => {
  it("reuses one repository connection and owns replacement lifecycle", async () => {
    const repositoryA = createRepository("A");
    const repositoryB = createRepository("B");
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
      scheduler: testApplicationScheduler,
    });

    slot.reconcile(repositoryA);
    const first = slot.getController();

    expect(slot.getSnapshot().status).toBe("loading");
    slot.start();
    await vi.waitFor(() => expect(slot.getSnapshot().status).toBe("ready"));

    slot.reconcile(repositoryA);
    expect(slot.getController()).toBe(first);

    const disposeFirst = vi.spyOn(first!, "dispose");

    slot.reconcile(repositoryB);
    expect(disposeFirst).toHaveBeenCalledOnce();
    expect(slot.getController()).not.toBe(first);
    await vi.waitFor(() => expect(slot.getSnapshot().status).toBe("ready"));
    expect(onChange).toHaveBeenCalled();

    slot.dispose();
    expect(slot.getSnapshot().status).toBe("absent");
  });
});
