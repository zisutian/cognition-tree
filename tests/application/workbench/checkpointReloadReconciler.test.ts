// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createCheckpointReloadReconciler,
  type CheckpointReloadState,
} from "../../../application/workbench/checkpointReloadReconciler";
import type {
  DomainChangeNotification,
} from "../../../application/sync/domainChangeEvents";

function notification({
  sequence = 1,
  streamId = "stream-a",
  workspaceCatalog = false,
}: {
  sequence?: number;
  streamId?: string;
  workspaceCatalog?: boolean;
} = {}): DomainChangeNotification {
  return {
    changedDomains: {
      journal: true,
      todo: true,
      workspaceCatalog,
      workspaceRepositoryIds: ["repository-a"],
    },
    checkpoint: {
      journal: "sha256:journal-new",
      sequence,
      streamId,
      todo: "sha256:todo-new",
      workspaces: {
        "repository-a": "sha256:workspace-new",
        "repository-b": "sha256:workspace-b",
      },
    },
    sequence,
    streamId,
  };
}

describe("checkpoint reload reconciler", () => {
  it("owns stream lifecycle and reloads each stale mounted projection once", async () => {
    let listener: (event: DomainChangeNotification) => void = () => undefined;
    const state: CheckpointReloadState = {
      catalog: {
        activeRepositoryId: "repository-a",
        knownRepositoryIds: ["repository-a", "repository-b"],
      },
      journalRemoteRevision: "sha256:journal-old",
      todoRemoteRevision: "sha256:todo-old",
      workspaceRemoteRevision: "sha256:workspace-old",
    };
    const reloadCatalog = vi.fn(async () => undefined);
    const reloadJournal = vi.fn(async () => undefined);
    const reloadTodo = vi.fn(async () => undefined);
    const reloadWorkspace = vi.fn(async () => undefined);
    const start = vi.fn();
    const dispose = vi.fn();
    const unsubscribe = vi.fn();
    const reconciler = createCheckpointReloadReconciler({
      actions: {
        reloadCatalog,
        reloadJournal,
        reloadTodo,
        reloadWorkspace,
      },
      getState: () => state,
      source: {
        dispose,
        start,
        subscribe(next) {
          listener = next;
          return unsubscribe;
        },
      },
    });
    const first = notification();

    listener(first);
    expect(reloadWorkspace).not.toHaveBeenCalled();

    reconciler.start();
    await vi.waitFor(() => {
      expect(reloadWorkspace).toHaveBeenCalledOnce();
      expect(reloadJournal).toHaveBeenCalledOnce();
      expect(reloadTodo).toHaveBeenCalledOnce();
    });
    expect(start).toHaveBeenCalledOnce();
    expect(reloadCatalog).not.toHaveBeenCalled();

    listener(first);
    reconciler.notifyStateChanged();
    await Promise.resolve();
    expect(reloadWorkspace).toHaveBeenCalledOnce();
    expect(reloadJournal).toHaveBeenCalledOnce();
    expect(reloadTodo).toHaveBeenCalledOnce();

    listener(notification({ sequence: 2, workspaceCatalog: true }));
    await vi.waitFor(() => expect(reloadCatalog).toHaveBeenCalledOnce());

    listener(notification({ sequence: 0, streamId: "stream-b" }));
    await vi.waitFor(() => {
      expect(reloadWorkspace).toHaveBeenCalledTimes(2);
      expect(reloadJournal).toHaveBeenCalledTimes(2);
      expect(reloadTodo).toHaveBeenCalledTimes(2);
    });

    reconciler.dispose();
    reconciler.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("waits for ready projections and ignores older checkpoints", async () => {
    let listener: (event: DomainChangeNotification) => void = () => undefined;
    const state: CheckpointReloadState = {
      catalog: {
        activeRepositoryId: "repository-a",
        knownRepositoryIds: null,
      },
      journalRemoteRevision: null,
      todoRemoteRevision: null,
      workspaceRemoteRevision: null,
    };
    const reloadCatalog = vi.fn(async () => undefined);
    const reloadJournal = vi.fn(async () => undefined);
    const reloadTodo = vi.fn(async () => undefined);
    const reloadWorkspace = vi.fn(async () => undefined);
    const reconciler = createCheckpointReloadReconciler({
      actions: {
        reloadCatalog,
        reloadJournal,
        reloadTodo,
        reloadWorkspace,
      },
      getState: () => state,
      source: {
        dispose() {},
        start() {},
        subscribe(next) {
          listener = next;
          return () => undefined;
        },
      },
    });

    reconciler.start();
    listener(notification({ sequence: 2 }));
    listener(notification({ sequence: 1 }));
    await Promise.resolve();
    expect(reloadCatalog).not.toHaveBeenCalled();
    expect(reloadWorkspace).not.toHaveBeenCalled();

    state.catalog.knownRepositoryIds = ["repository-a"];
    state.workspaceRemoteRevision = "sha256:workspace-old";
    state.journalRemoteRevision = "sha256:journal-old";
    reconciler.notifyStateChanged();
    await vi.waitFor(() => {
      expect(reloadCatalog).toHaveBeenCalledOnce();
      expect(reloadWorkspace).toHaveBeenCalledOnce();
      expect(reloadJournal).toHaveBeenCalledOnce();
    });
    expect(reloadTodo).not.toHaveBeenCalled();
  });
});
