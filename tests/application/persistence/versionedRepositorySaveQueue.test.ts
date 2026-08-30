import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  WorkspaceRepository,
  WorkspaceRepositoryContent,
  WorkspaceRepositorySyncResult,
} from "../../../application/workspace/persistence/workspaceRepository";
import {
  createVersionedRepositorySaveQueue as createWorkspaceSessionSaveQueue,
  VersionedRepositorySynchronizationBlockedError,
  versionedRepositoryRetryDelaysMs as workspaceSessionRetryDelaysMs,
  versionedRepositorySaveDelayMs as workspaceSessionSaveDelayMs,
  type VersionedRepositoryPersistenceState,
} from "../../../application/persistence/versionedRepositorySaveQueue";
import {
  createContent,
  createSnapshot,
  draftRevision,
  remoteRevision,
} from "../workspace/session/workspaceSessionTestFixture";
import { testApplicationScheduler } from "../../support/testApplicationScheduler";
import { prepareWorkspaceRepositoryContent } from "../../../application/workspace/persistence/workspaceRepositoryPreparation";

type WorkspacePersistenceState = VersionedRepositoryPersistenceState<
  import("../../../application/workspace/persistence/workspaceRepository").RepositoryRevision
>;

function prepareContent(name: string) {
  const content = createContent(name);

  return {
    content,
    projection: prepareWorkspaceRepositoryContent(content),
  };
}

function createSyncResult({
  localRevision = draftRevision("stage-1"),
  message,
  pendingChanges = false,
  prepared,
  remoteRevision: nextRemoteRevision = remoteRevision("b"),
  status,
}: {
  localRevision?: ReturnType<typeof draftRevision>;
  message?: string;
  pendingChanges?: boolean;
  prepared?: ReturnType<typeof prepareContent>;
  remoteRevision?: ReturnType<typeof remoteRevision>;
  status: WorkspaceRepositorySyncResult["status"];
}): WorkspaceRepositorySyncResult {
  const snapshot = createSnapshot({
    conflictRevision: status === "conflict" ? nextRemoteRevision : null,
    localRevision,
    pendingChanges: status === "conflict" ? true : pendingChanges,
    ...(prepared
      ? { content: prepared.content, projection: prepared.projection }
      : {}),
    remoteRevision: nextRemoteRevision,
  });
  const transitions = [{
    previousLocalRevision: localRevision,
    snapshot,
  }] as const;

  switch (status) {
    case "conflict":
      return { status: "conflict", transitions };
    case "offline":
      return { status: "offline", transitions };
    case "synced":
      return { status: "synced", transitions };
    case "sync-error":
      return {
        message: message ?? "sync failed",
        status: "sync-error",
        transitions,
      };
  }
}

function createStageTransition(
  after: ReturnType<typeof prepareContent>,
  previousLocalRevision: ReturnType<typeof draftRevision>,
  localRevision: ReturnType<typeof draftRevision>,
  snapshotOverrides: Partial<ReturnType<typeof createSnapshot>> = {},
) {
  return {
    previousLocalRevision,
    snapshot: createSnapshot({
      content: after.content,
      localRevision,
      pendingChanges: true,
      projection: after.projection,
      ...snapshotOverrides,
    }),
  };
}

function createDeferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

function createQueueHarness({
  initialPersistenceState,
  initialSnapshot = createSnapshot(),
  stage,
  synchronize,
}: {
  initialPersistenceState?: WorkspacePersistenceState;
  initialSnapshot?: ReturnType<typeof createSnapshot>;
  stage?: WorkspaceRepository["stageSnapshot"];
  synchronize?: WorkspaceRepository["synchronizePendingSnapshot"];
} = {}) {
  const localContents: WorkspaceRepositoryContent[] = [];
  const persistence: WorkspacePersistenceState[] = [];
  const snapshots: ReturnType<typeof createSnapshot>[] = [];
  let localRevisionIndex = 0;
  let reconnectListener: () => void = () => undefined;
  let snapshot = initialSnapshot;
  const repository: WorkspaceRepository = {
    discardPendingSnapshotAndReload: async () => createSnapshot(),
    label: "test repository",
    loadConflict: async () => null,
    loadSnapshot: async () => snapshot,
    location: {
      hostPath: null,
      serverPath: "/repositories/test",
    },
    async resolveConflictAndSynchronize() {
      throw new Error("Unexpected conflict resolution in save queue test.");
    },
    async stageSnapshot(input) {
      const transition = stage
        ? await stage(input)
        : (() => {
            const previousLocalRevision = snapshot.localRevision;

            localRevisionIndex += 1;
            snapshot = {
              ...snapshot,
              content: input.after.content,
              localRevision: draftRevision(`stage-${localRevisionIndex}`),
              pendingChanges: true,
              projection: input.after.projection,
            };
            return { previousLocalRevision, snapshot };
          })();

      snapshot = transition.snapshot;
      localContents.push(snapshot.content);
      return transition;
    },
    subscribeReconnect(listener) {
      reconnectListener = listener;
      return () => {
        reconnectListener = () => undefined;
      };
    },
    async synchronizePendingSnapshot() {
      if (synchronize) {
        const result = await synchronize();

        snapshot = result.transitions.at(-1)!.snapshot;
        return result;
      }
      const previousLocalRevision = snapshot.localRevision;

      snapshot = {
        ...snapshot,
        conflictRevision: null,
        pendingChanges: false,
        remoteRevision: remoteRevision("b"),
      };
      return {
        status: "synced",
        transitions: [{ previousLocalRevision, snapshot }],
      };
    },
  };
  let persistedSnapshot = initialSnapshot;
  const saveQueue = createWorkspaceSessionSaveQueue({
    initialPersistenceState,
    initialSnapshot,
    onPersistenceChange(state) {
      persistence.push(state);
    },
    onSnapshotChanged(nextSnapshot) {
      snapshots.push(nextSnapshot);
      persistedSnapshot = nextSnapshot;
    },
    repository,
    scheduler: testApplicationScheduler,
  });
  const queue = {
    ...saveQueue,
    enqueue(after: ReturnType<typeof prepareContent>) {
      saveQueue.enqueue({
        after,
        baseLocalRevision: persistedSnapshot.localRevision,
        before: {
          content: persistedSnapshot.content,
          projection: persistedSnapshot.projection,
        },
      });
    },
  };

  return {
    emitReconnect: () => reconnectListener(),
    localContents,
    persistence,
    queue,
    repository,
    snapshots,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("workspace session save queue", () => {
  it("stages immediately, then debounces only the remote synchronization", async () => {
    vi.useFakeTimers();
    const synchronize = vi.fn(async () => createSyncResult({
      localRevision: draftRevision("stage-1"),
      prepared: prepareContent("立即本地保存"),
      remoteRevision: remoteRevision("b"),
      status: "synced",
    }));
    const harness = createQueueHarness({ synchronize });

    harness.queue.enqueue(prepareContent("立即本地保存"));
    await harness.queue.flushLocal();

    expect(harness.localContents.map(({ workspace }) => workspace.name)).toEqual([
      "立即本地保存",
    ]);
    expect(synchronize).not.toHaveBeenCalled();
    expect(harness.persistence.at(-1)).toEqual({ status: "pending-sync" });

    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs - 1);
    expect(synchronize).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(harness.persistence.at(-1)).toEqual({ status: "saved" });
    harness.queue.dispose();
  });

  it("forces local staging and remote synchronization before an Agent boundary", async () => {
    const synchronize = vi.fn(async () => createSyncResult({
      localRevision: draftRevision("stage-1"),
      prepared: prepareContent("Agent-visible edit"),
      remoteRevision: remoteRevision("b"),
      status: "synced",
    }));
    const harness = createQueueHarness({ synchronize });

    harness.queue.enqueue(prepareContent("Agent-visible edit"));
    await harness.queue.synchronizePendingChanges();

    expect(harness.localContents.at(-1)?.workspace.name).toBe(
      "Agent-visible edit",
    );
    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(harness.persistence.at(-1)).toEqual({ status: "saved" });
    harness.queue.dispose();
  });

  it.each([
    {
      message: "offline",
      result: createSyncResult({
        localRevision: draftRevision("stage-1"),
        pendingChanges: true,
        prepared: prepareContent("must not bypass sync"),
        remoteRevision: remoteRevision("a"),
        status: "offline",
      }),
    },
    {
      message: "conflict",
      result: createSyncResult({
        localRevision: draftRevision("stage-1"),
        prepared: prepareContent("must not bypass sync"),
        remoteRevision: remoteRevision("c"),
        status: "conflict",
      }),
    },
    {
      message: "unauthorized",
      result: createSyncResult({
        localRevision: draftRevision("stage-1"),
        message: "unauthorized",
        prepared: prepareContent("must not bypass sync"),
        remoteRevision: remoteRevision("a"),
        status: "sync-error",
      }),
    },
  ])("blocks an Agent boundary on $message synchronization state", async ({
    message,
    result,
  }) => {
    const harness = createQueueHarness({
      synchronize: vi.fn(async () => result),
    });

    harness.queue.enqueue(prepareContent("must not bypass sync"));
    const synchronization = harness.queue.synchronizePendingChanges();

    await expect(synchronization).rejects
      .toBeInstanceOf(VersionedRepositorySynchronizationBlockedError);
    await expect(synchronization).rejects.toThrow(message);
    harness.queue.dispose();
  });

  it("flushes an already staged version while the stage promise is finalizing", async () => {
    const stageResult = createDeferred<Awaited<
      ReturnType<WorkspaceRepository["stageSnapshot"]>
    >>();
    const harness = createQueueHarness({
      stage: () => stageResult.promise,
    });

    harness.queue.enqueue(prepareContent("completion watermark"));
    const firstFlush = harness.queue.flushLocal();

    stageResult.resolve(createStageTransition(
      prepareContent("completion watermark"),
      draftRevision("initial"),
      draftRevision("stage-1"),
    ));
    await firstFlush;
    await harness.queue.flushLocal();

    expect(harness.localContents.map(({ workspace }) => workspace.name))
      .toEqual(["completion watermark"]);
    harness.queue.dispose();
  });

  it("serializes local stages and replaces queued content with the latest desired snapshot", async () => {
    const firstStage = createDeferred<Awaited<
      ReturnType<WorkspaceRepository["stageSnapshot"]>
    >>();
    const stagedNames: string[] = [];
    let stageCount = 0;
    const stage: WorkspaceRepository["stageSnapshot"] = async (change) => {
      stageCount += 1;
      stagedNames.push(change.after.content.workspace.name);

      if (stageCount === 1) {
        return firstStage.promise;
      }

      return createStageTransition(
        change.after,
        draftRevision(`stage-${stageCount - 1}`),
        draftRevision(`stage-${stageCount}`),
      );
    };
    const harness = createQueueHarness({ stage });

    harness.queue.enqueue(prepareContent("first"));
    harness.queue.enqueue(prepareContent("superseded"));
    harness.queue.enqueue(prepareContent("latest"));
    const flush = harness.queue.flushLocal();

    firstStage.resolve(createStageTransition(
      prepareContent("first"),
      draftRevision("initial"),
      draftRevision("stage-1"),
    ));
    await flush;

    expect(stagedNames).toEqual(["first", "latest"]);
    expect(harness.queue.getLocalRevision()).toBe(draftRevision("stage-2"));
    harness.queue.dispose();
  });

  it("stops after a local stage failure, preserves the latest desired content, and retries explicitly", async () => {
    vi.useFakeTimers();
    const stagedNames: string[] = [];
    const synchronize = vi.fn(async () => createSyncResult({
      localRevision: draftRevision("stage-retried"),
      prepared: prepareContent("latest"),
      remoteRevision: remoteRevision("b"),
      status: "synced",
    }));
    let shouldFail = true;
    const stage: WorkspaceRepository["stageSnapshot"] = async (change) => {
      stagedNames.push(change.after.content.workspace.name);

      if (shouldFail) {
        shouldFail = false;
        throw new Error("Client cache transaction failed");
      }

      return createStageTransition(
        change.after,
        draftRevision("initial"),
        draftRevision("stage-retried"),
      );
    };
    const harness = createQueueHarness({ stage, synchronize });

    harness.queue.enqueue(prepareContent("latest"));
    await expect(harness.queue.flushLocal()).rejects.toThrow(
      "Client cache transaction failed",
    );
    await Promise.resolve();

    expect(stagedNames).toEqual(["latest"]);
    expect(harness.persistence.at(-1)).toEqual({
      localCopySafe: false,
      message: "Client cache transaction failed",
      phase: "local",
      status: "error",
    });

    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);
    harness.emitReconnect();
    await Promise.resolve();

    expect(synchronize).not.toHaveBeenCalled();
    expect(harness.persistence.at(-1)).toEqual({
      localCopySafe: false,
      message: "Client cache transaction failed",
      phase: "local",
      status: "error",
    });

    await harness.queue.flushLocal();
    expect(stagedNames).toEqual(["latest", "latest"]);
    expect(harness.localContents.at(-1)?.workspace.name).toBe("latest");
    harness.queue.dispose();
  });

  it("rejects new queue entries after publishing a conflict", async () => {
    vi.useFakeTimers();
    const conflictRevision = remoteRevision("c");
    const synchronize = vi.fn(async () => createSyncResult({
      localRevision: draftRevision("stage-1"),
      prepared: prepareContent("before conflict"),
      remoteRevision: conflictRevision,
      status: "conflict",
    }));
    const harness = createQueueHarness({ synchronize });

    harness.queue.enqueue(prepareContent("before conflict"));
    await harness.queue.flushLocal();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);

    expect(harness.persistence.at(-1)).toEqual({
      remoteRevision: conflictRevision,
      status: "conflict",
    });

    expect(() =>
      harness.queue.enqueue(prepareContent("after conflict"))
    ).toThrow(
      "Repository conflict must be resolved before editing.",
    );
    expect(harness.localContents.at(-1)?.workspace.name).toBe("before conflict");
    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(harness.persistence.at(-1)).toEqual({
      remoteRevision: conflictRevision,
      status: "conflict",
    });
    harness.queue.dispose();
  });

  it("retries an offline pending snapshot and reconnect triggers a real sync immediately", async () => {
    vi.useFakeTimers();
    const results: WorkspaceRepositorySyncResult[] = [
      createSyncResult({
        localRevision: draftRevision("stage-1"),
        pendingChanges: true,
        prepared: prepareContent("offline edit"),
        remoteRevision: remoteRevision("a"),
        status: "offline",
      }),
      createSyncResult({
        localRevision: draftRevision("stage-1"),
        prepared: prepareContent("offline edit"),
        remoteRevision: remoteRevision("b"),
        status: "synced",
      }),
    ];
    const synchronize = vi.fn(async () => results.shift()!);
    const harness = createQueueHarness({ synchronize });

    harness.queue.enqueue(prepareContent("offline edit"));
    await harness.queue.flushLocal();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);

    expect(harness.persistence.at(-1)).toEqual({
      pendingChanges: true,
      status: "offline",
    });
    expect(synchronize).toHaveBeenCalledTimes(1);

    harness.emitReconnect();
    await vi.waitFor(() => {
      expect(synchronize).toHaveBeenCalledTimes(2);
      expect(harness.persistence.at(-1)).toEqual({ status: "saved" });
    });
    harness.queue.dispose();
  });

  it("resumes an explicit pending sync restored after reload", async () => {
    vi.useFakeTimers();
    const synchronize = vi.fn(async () => createSyncResult({
      localRevision: draftRevision("initial"),
      pendingChanges: true,
      remoteRevision: remoteRevision("a"),
      status: "offline",
    }));
    const harness = createQueueHarness({
      initialPersistenceState: { status: "pending-sync" },
      initialSnapshot: createSnapshot({ pendingChanges: true }),
      synchronize,
    });

    expect(harness.persistence.at(-1)).toEqual({ status: "pending-sync" });
    expect(synchronize).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);

    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(harness.persistence.at(-1)).toEqual({
      pendingChanges: true,
      status: "offline",
    });
    harness.queue.dispose();
  });

  it("derives an initial conflict directly from the repository snapshot", async () => {
    vi.useFakeTimers();
    const conflictRevision = remoteRevision("c");
    const synchronize = vi.fn(async () => createSyncResult({
      localRevision: draftRevision("initial"),
      prepared: prepareContent("conflicted"),
      remoteRevision: conflictRevision,
      status: "conflict",
    }));
    const harness = createQueueHarness({
      initialSnapshot: createSnapshot({
        conflictRevision,
        pendingChanges: true,
        remoteRevision: conflictRevision,
      }),
      synchronize,
    });

    expect(harness.persistence.at(-1)).toEqual({
      remoteRevision: conflictRevision,
      status: "conflict",
    });
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);
    expect(synchronize).not.toHaveBeenCalled();
    harness.queue.dispose();
  });

  it("surfaces a thrown synchronization-state failure without an unhandled rejection or automatic retry", async () => {
    vi.useFakeTimers();
    const synchronize = vi.fn(async () => {
      throw new Error("Client cache synchronization state disappeared");
    });
    const harness = createQueueHarness({ synchronize });

    harness.queue.enqueue(prepareContent("durable local edit"));
    await harness.queue.flushLocal();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);

    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(harness.persistence.at(-1)).toEqual({
      localCopySafe: false,
      message: "Client cache synchronization state disappeared",
      phase: "local",
      status: "error",
    });

    await vi.advanceTimersByTimeAsync(workspaceSessionRetryDelaysMs.at(-1)!);
    expect(synchronize).toHaveBeenCalledTimes(1);
    harness.queue.dispose();
  });

  it("does not retry a terminal remote error merely because the client reports online", async () => {
    vi.useFakeTimers();
    const synchronize = vi
      .fn<WorkspaceRepository["synchronizePendingSnapshot"]>()
      .mockResolvedValueOnce(createSyncResult({
        localRevision: draftRevision("stage-1"),
        message: "unauthorized",
        prepared: prepareContent("terminal failure"),
        remoteRevision: remoteRevision("a"),
        status: "sync-error",
      }))
      .mockResolvedValue(createSyncResult({
        localRevision: draftRevision("stage-2"),
        prepared: prepareContent("explicit new edit"),
        remoteRevision: remoteRevision("b"),
        status: "synced",
      }));
    const harness = createQueueHarness({ synchronize });

    harness.queue.enqueue(prepareContent("terminal failure"));
    await harness.queue.flushLocal();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);
    expect(harness.persistence.at(-1)).toMatchObject({
      message: "unauthorized",
      phase: "sync",
      status: "error",
    });

    harness.emitReconnect();
    await Promise.resolve();
    expect(synchronize).toHaveBeenCalledTimes(1);

    harness.queue.enqueue(prepareContent("explicit new edit"));
    await harness.queue.flushLocal();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);
    expect(synchronize).toHaveBeenCalledTimes(2);
    expect(harness.persistence.at(-1)).toEqual({ status: "saved" });
    harness.queue.dispose();
  });

  it("does not lose the newest stage when an older sync finishes after a new debounce timer", async () => {
    vi.useFakeTimers();
    const firstSync = createDeferred<WorkspaceRepositorySyncResult>();
    const synchronize = vi
      .fn<WorkspaceRepository["synchronizePendingSnapshot"]>()
      .mockImplementationOnce(() => firstSync.promise)
      .mockResolvedValue(createSyncResult({
        localRevision: draftRevision("stage-2"),
        prepared: prepareContent("latest"),
        remoteRevision: remoteRevision("c"),
        status: "synced",
      }));
    const harness = createQueueHarness({ synchronize });

    harness.queue.enqueue(prepareContent("old"));
    await harness.queue.flushLocal();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);
    expect(synchronize).toHaveBeenCalledTimes(1);

    harness.queue.enqueue(prepareContent("latest"));
    await harness.queue.flushLocal();
    firstSync.resolve(createSyncResult({
      localRevision: draftRevision("stage-2"),
      pendingChanges: true,
      prepared: prepareContent("latest"),
      remoteRevision: remoteRevision("a"),
      status: "offline",
    }));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);

    expect(harness.localContents.at(-1)?.workspace.name).toBe("latest");
    expect(synchronize).toHaveBeenCalledTimes(2);
    expect(harness.persistence.at(-1)).toEqual({ status: "saved" });
    harness.queue.dispose();
  });

  it("orders concurrent repository transitions before publishing one prepared snapshot authority", async () => {
    vi.useFakeTimers();
    const synchronized = createDeferred<WorkspaceRepositorySyncResult>();
    const continuedStage = createDeferred<Awaited<
      ReturnType<WorkspaceRepository["stageSnapshot"]>
    >>();
    let stageCount = 0;
    const stage: WorkspaceRepository["stageSnapshot"] = async (change) => {
      stageCount += 1;
      return stageCount === 1
        ? createStageTransition(
            change.after,
            draftRevision("initial"),
            draftRevision("stage-1"),
          )
        : continuedStage.promise;
    };
    const synchronize = vi.fn(() => synchronized.promise);
    const harness = createQueueHarness({ stage, synchronize });

    harness.queue.enqueue(prepareContent("submitted"));
    await harness.queue.flushLocal();
    harness.queue.requestSync();
    await vi.waitFor(() => expect(synchronize).toHaveBeenCalledTimes(1));

    harness.queue.enqueue(prepareContent("continued optimistic"));
    const continuedFlush = harness.queue.flushLocal();
    const remotePrepared = prepareContent("submitted + remote");
    const synchronizedSnapshot = createSnapshot({
      content: remotePrepared.content,
      localRevision: draftRevision("sync-2"),
      pendingChanges: false,
      projection: remotePrepared.projection,
      remoteRevision: remoteRevision("b"),
    });

    synchronized.resolve({
      status: "synced",
      transitions: [{
        previousLocalRevision: draftRevision("stage-1"),
        snapshot: synchronizedSnapshot,
      }],
    });
    await vi.waitFor(() => {
      expect(harness.queue.getLocalRevision()).toBe(draftRevision("sync-2"));
    });
    expect(harness.snapshots.at(-1)?.content.workspace.name).toBe("submitted");

    const continuedPrepared = prepareContent(
      "submitted + remote + continued optimistic",
    );
    continuedStage.resolve(createStageTransition(
      continuedPrepared,
      draftRevision("sync-2"),
      draftRevision("stage-3"),
      { remoteRevision: remoteRevision("b") },
    ));
    await continuedFlush;

    expect(harness.snapshots.at(-1)).toMatchObject({
      content: {
        workspace: {
          name: "submitted + remote + continued optimistic",
        },
      },
      localRevision: draftRevision("stage-3"),
      pendingChanges: true,
      remoteRevision: remoteRevision("b"),
    });
    expect(harness.snapshots.at(-1)?.projection).toBe(
      continuedPrepared.projection,
    );
    harness.queue.dispose();
  });

  it("reaches the same prepared snapshot when the continued stage finishes before synchronization", async () => {
    vi.useFakeTimers();
    const synchronized = createDeferred<WorkspaceRepositorySyncResult>();
    let stageCount = 0;
    const stage: WorkspaceRepository["stageSnapshot"] = async (change) => {
      stageCount += 1;
      return createStageTransition(
        change.after,
        draftRevision(stageCount === 1 ? "initial" : "stage-1"),
        draftRevision(`stage-${stageCount}`),
      );
    };
    const synchronize = vi.fn(() => synchronized.promise);
    const harness = createQueueHarness({ stage, synchronize });

    harness.queue.enqueue(prepareContent("submitted"));
    await harness.queue.flushLocal();
    harness.queue.requestSync();
    await vi.waitFor(() => expect(synchronize).toHaveBeenCalledTimes(1));

    harness.queue.enqueue(prepareContent("submitted + continued optimistic"));
    await harness.queue.flushLocal();
    expect(harness.snapshots.at(-1)).toMatchObject({
      content: {
        workspace: { name: "submitted + continued optimistic" },
      },
      localRevision: draftRevision("stage-2"),
      pendingChanges: true,
    });

    const finalPrepared = prepareContent(
      "submitted + remote + continued optimistic",
    );
    synchronized.resolve({
      status: "synced",
      transitions: [{
        previousLocalRevision: draftRevision("stage-2"),
        snapshot: createSnapshot({
          content: finalPrepared.content,
          localRevision: draftRevision("sync-3"),
          pendingChanges: false,
          projection: finalPrepared.projection,
          remoteRevision: remoteRevision("b"),
        }),
      }],
    });
    await vi.waitFor(() => {
      expect(harness.queue.getLocalRevision()).toBe(draftRevision("sync-3"));
    });

    expect(harness.snapshots.at(-1)).toMatchObject({
      content: {
        workspace: {
          name: "submitted + remote + continued optimistic",
        },
      },
      localRevision: draftRevision("sync-3"),
      pendingChanges: false,
      remoteRevision: remoteRevision("b"),
    });
    expect(harness.snapshots.at(-1)?.projection).toBe(finalPrepared.projection);
    harness.queue.dispose();
  });

  it("drains an already active and queued local stage on dispose while cancelling remote work", async () => {
    vi.useFakeTimers();
    const firstStage = createDeferred<Awaited<
      ReturnType<WorkspaceRepository["stageSnapshot"]>
    >>();
    const stagedNames: string[] = [];
    let stageCount = 0;
    const stage: WorkspaceRepository["stageSnapshot"] = async (change) => {
      stagedNames.push(change.after.content.workspace.name);
      stageCount += 1;
      return stageCount === 1
        ? firstStage.promise
        : createStageTransition(
            change.after,
            draftRevision("stage-1"),
            draftRevision("stage-2"),
          );
    };
    const synchronize = vi.fn(async () => createSyncResult({
      localRevision: draftRevision("stage-2"),
      prepared: prepareContent("latest"),
      remoteRevision: remoteRevision("b"),
      status: "synced",
    }));
    const harness = createQueueHarness({ stage, synchronize });

    harness.queue.enqueue(prepareContent("active"));
    harness.queue.enqueue(prepareContent("latest"));
    harness.queue.dispose();
    firstStage.resolve(createStageTransition(
      prepareContent("active"),
      draftRevision("initial"),
      draftRevision("stage-1"),
    ));
    await vi.waitFor(() => expect(stagedNames).toEqual(["active", "latest"]));
    await vi.advanceTimersByTimeAsync(
      workspaceSessionSaveDelayMs + workspaceSessionRetryDelaysMs[0],
    );

    expect(synchronize).not.toHaveBeenCalled();
  });
});
