import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  WorkspaceRepository,
  WorkspaceRepositoryContent,
  WorkspaceRepositorySyncResult,
} from "../../../application/repository/workspaceRepository";
import {
  createVersionedRepositorySaveQueue as createWorkspaceSessionSaveQueue,
  versionedRepositoryRetryDelaysMs as workspaceSessionRetryDelaysMs,
  versionedRepositorySaveDelayMs as workspaceSessionSaveDelayMs,
  type VersionedRepositoryPersistenceState,
} from "../../../application/repository/versionedRepositorySaveQueue";
import {
  createContent,
  createSnapshot,
  draftRevision,
  remoteRevision,
} from "../workspace/session/workspaceSessionTestFixture";
import { testApplicationScheduler } from "../../support/testApplicationScheduler";

type WorkspacePersistenceState = VersionedRepositoryPersistenceState<
  import("../../../application/repository/workspaceRepository").RepositoryRevision
>;

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
  stage,
  synchronize,
}: {
  stage?: WorkspaceRepository["stageSnapshot"];
  synchronize?: WorkspaceRepository["synchronizePendingSnapshot"];
} = {}) {
  const localContents: WorkspaceRepositoryContent[] = [];
  const persistence: WorkspacePersistenceState[] = [];
  const remoteRevisions: Array<ReturnType<typeof remoteRevision> | null> = [];
  let localRevisionIndex = 0;
  let reconnectListener: () => void = () => undefined;
  const repository: WorkspaceRepository = {
    discardPendingSnapshotAndReload: async () => createSnapshot(),
    label: "test repository",
    loadSnapshot: async () => createSnapshot(),
    location: { databaseName: "test", type: "browser" },
    async stageSnapshot(input) {
      if (stage) {
        return stage(input);
      }

      localContents.push(input.content);
      localRevisionIndex += 1;
      return { localRevision: draftRevision(`stage-${localRevisionIndex}`) };
    },
    subscribeReconnect(listener) {
      reconnectListener = listener;
      return () => {
        reconnectListener = () => undefined;
      };
    },
    async synchronizePendingSnapshot() {
      if (synchronize) {
        return synchronize();
      }

      return {
        localRevision: draftRevision(`stage-${localRevisionIndex}`),
        pendingChanges: false,
        remoteRevision: remoteRevision("b"),
        status: "synced",
      };
    },
  };
  const queue = createWorkspaceSessionSaveQueue({
    initialSnapshot: createSnapshot(),
    onLocalStaged(content, revision) {
      if (stage) {
        localContents.push(content);
        localRevisionIndex = Number(revision.slice("draft:stage-".length)) ||
          localRevisionIndex + 1;
      }
    },
    onPersistenceChange(state) {
      persistence.push(state);
    },
    onRemoteRevision(revision) {
      remoteRevisions.push(revision);
    },
    repository,
    scheduler: testApplicationScheduler,
  });

  return {
    emitReconnect: () => reconnectListener(),
    localContents,
    persistence,
    queue,
    remoteRevisions,
    repository,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("workspace session save queue", () => {
  it("stages immediately, then debounces only the remote synchronization", async () => {
    vi.useFakeTimers();
    const synchronize = vi.fn(async () => ({
      localRevision: draftRevision("stage-1"),
      pendingChanges: false,
      remoteRevision: remoteRevision("b"),
      status: "synced" as const,
    }));
    const harness = createQueueHarness({ synchronize });

    harness.queue.enqueue(createContent("立即本地保存"));
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

  it("flushes an already staged version while the stage promise is finalizing", async () => {
    const stageResult = createDeferred<{
      localRevision: ReturnType<typeof draftRevision>;
    }>();
    const harness = createQueueHarness({
      stage: () => stageResult.promise,
    });

    harness.queue.enqueue(createContent("completion watermark"));
    const firstFlush = harness.queue.flushLocal();

    stageResult.resolve({ localRevision: draftRevision("stage-1") });
    await firstFlush;
    await harness.queue.flushLocal();

    expect(harness.localContents.map(({ workspace }) => workspace.name))
      .toEqual(["completion watermark"]);
    harness.queue.dispose();
  });

  it("serializes local stages and replaces queued content with the latest desired snapshot", async () => {
    const firstStage = createDeferred<{ localRevision: ReturnType<typeof draftRevision> }>();
    const stagedNames: string[] = [];
    let stageCount = 0;
    const stage: WorkspaceRepository["stageSnapshot"] = async ({ content }) => {
      stageCount += 1;
      stagedNames.push(content.workspace.name);

      if (stageCount === 1) {
        return firstStage.promise;
      }

      return { localRevision: draftRevision(`stage-${stageCount}`) };
    };
    const harness = createQueueHarness({ stage });

    harness.queue.enqueue(createContent("first"));
    harness.queue.enqueue(createContent("superseded"));
    harness.queue.enqueue(createContent("latest"));
    const flush = harness.queue.flushLocal();

    firstStage.resolve({ localRevision: draftRevision("stage-1") });
    await flush;

    expect(stagedNames).toEqual(["first", "latest"]);
    expect(harness.queue.getLocalRevision()).toBe(draftRevision("stage-2"));
    harness.queue.dispose();
  });

  it("stops after a local stage failure, preserves the latest desired content, and retries explicitly", async () => {
    vi.useFakeTimers();
    const stagedNames: string[] = [];
    const synchronize = vi.fn(async () => ({
      localRevision: draftRevision("stage-retried"),
      pendingChanges: false,
      remoteRevision: remoteRevision("b"),
      status: "synced" as const,
    }));
    let shouldFail = true;
    const stage: WorkspaceRepository["stageSnapshot"] = async ({ content }) => {
      stagedNames.push(content.workspace.name);

      if (shouldFail) {
        shouldFail = false;
        throw new Error("IndexedDB transaction failed");
      }

      return { localRevision: draftRevision("stage-retried") };
    };
    const harness = createQueueHarness({ stage, synchronize });

    harness.queue.enqueue(createContent("latest"));
    await expect(harness.queue.flushLocal()).rejects.toThrow(
      "IndexedDB transaction failed",
    );
    await Promise.resolve();

    expect(stagedNames).toEqual(["latest"]);
    expect(harness.persistence.at(-1)).toEqual({
      localCopySafe: false,
      message: "IndexedDB transaction failed",
      phase: "local",
      status: "error",
    });

    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);
    harness.emitReconnect();
    await Promise.resolve();

    expect(synchronize).not.toHaveBeenCalled();
    expect(harness.persistence.at(-1)).toEqual({
      localCopySafe: false,
      message: "IndexedDB transaction failed",
      phase: "local",
      status: "error",
    });

    await harness.queue.flushLocal();
    expect(stagedNames).toEqual(["latest", "latest"]);
    expect(harness.localContents.at(-1)?.workspace.name).toBe("latest");
    harness.queue.dispose();
  });

  it("continues staging after a conflict and keeps only the newest local pending snapshot", async () => {
    vi.useFakeTimers();
    const conflictRevision = remoteRevision("c");
    const synchronize = vi.fn(async () => ({
      localRevision: draftRevision("stage-1"),
      remoteRevision: conflictRevision,
      status: "conflict" as const,
    }));
    const harness = createQueueHarness({ synchronize });

    harness.queue.enqueue(createContent("before conflict"));
    await harness.queue.flushLocal();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);

    expect(harness.persistence.at(-1)).toEqual({
      remoteRevision: conflictRevision,
      status: "conflict",
    });

    harness.queue.enqueue(createContent("superseded after conflict"));
    harness.queue.enqueue(createContent("latest after conflict"));
    await harness.queue.flushLocal();

    expect(harness.localContents.at(-1)?.workspace.name).toBe(
      "latest after conflict",
    );
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
      {
        localRevision: draftRevision("stage-1"),
        pendingChanges: true,
        remoteRevision: remoteRevision("a"),
        status: "offline",
      },
      {
        localRevision: draftRevision("stage-1"),
        pendingChanges: false,
        remoteRevision: remoteRevision("b"),
        status: "synced",
      },
    ];
    const synchronize = vi.fn(async () => results.shift()!);
    const harness = createQueueHarness({ synchronize });

    harness.queue.enqueue(createContent("offline edit"));
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

  it("surfaces a thrown synchronization-state failure without an unhandled rejection or automatic retry", async () => {
    vi.useFakeTimers();
    const synchronize = vi.fn(async () => {
      throw new Error("IndexedDB synchronization state disappeared");
    });
    const harness = createQueueHarness({ synchronize });

    harness.queue.enqueue(createContent("durable local edit"));
    await harness.queue.flushLocal();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);

    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(harness.persistence.at(-1)).toEqual({
      localCopySafe: false,
      message: "IndexedDB synchronization state disappeared",
      phase: "local",
      status: "error",
    });

    await vi.advanceTimersByTimeAsync(workspaceSessionRetryDelaysMs.at(-1)!);
    expect(synchronize).toHaveBeenCalledTimes(1);
    harness.queue.dispose();
  });

  it("does not retry a terminal remote error merely because the browser reports online", async () => {
    vi.useFakeTimers();
    const synchronize = vi
      .fn<WorkspaceRepository["synchronizePendingSnapshot"]>()
      .mockResolvedValueOnce({
        localRevision: draftRevision("stage-1"),
        message: "unauthorized",
        remoteRevision: remoteRevision("a"),
        status: "sync-error",
      })
      .mockResolvedValue({
        localRevision: draftRevision("stage-2"),
        pendingChanges: false,
        remoteRevision: remoteRevision("b"),
        status: "synced",
      });
    const harness = createQueueHarness({ synchronize });

    harness.queue.enqueue(createContent("terminal failure"));
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

    harness.queue.enqueue(createContent("explicit new edit"));
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
      .mockResolvedValue({
        localRevision: draftRevision("stage-2"),
        pendingChanges: false,
        remoteRevision: remoteRevision("c"),
        status: "synced",
      });
    const harness = createQueueHarness({ synchronize });

    harness.queue.enqueue(createContent("old"));
    await harness.queue.flushLocal();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);
    expect(synchronize).toHaveBeenCalledTimes(1);

    harness.queue.enqueue(createContent("latest"));
    await harness.queue.flushLocal();
    firstSync.resolve({
      localRevision: draftRevision("stage-1"),
      pendingChanges: true,
      remoteRevision: remoteRevision("a"),
      status: "offline",
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);

    expect(harness.localContents.at(-1)?.workspace.name).toBe("latest");
    expect(synchronize).toHaveBeenCalledTimes(2);
    expect(harness.persistence.at(-1)).toEqual({ status: "saved" });
    harness.queue.dispose();
  });

  it("drains an already active and queued local stage on dispose while cancelling remote work", async () => {
    vi.useFakeTimers();
    const firstStage = createDeferred<{ localRevision: ReturnType<typeof draftRevision> }>();
    const stagedNames: string[] = [];
    let stageCount = 0;
    const stage: WorkspaceRepository["stageSnapshot"] = async ({ content }) => {
      stagedNames.push(content.workspace.name);
      stageCount += 1;
      return stageCount === 1
        ? firstStage.promise
        : { localRevision: draftRevision("stage-2") };
    };
    const synchronize = vi.fn(async () => ({
      localRevision: draftRevision("stage-2"),
      pendingChanges: false,
      remoteRevision: remoteRevision("b"),
      status: "synced" as const,
    }));
    const harness = createQueueHarness({ stage, synchronize });

    harness.queue.enqueue(createContent("active"));
    harness.queue.enqueue(createContent("latest"));
    harness.queue.dispose();
    firstStage.resolve({ localRevision: draftRevision("stage-1") });
    await vi.waitFor(() => expect(stagedNames).toEqual(["active", "latest"]));
    await vi.advanceTimersByTimeAsync(
      workspaceSessionSaveDelayMs + workspaceSessionRetryDelaysMs[0],
    );

    expect(synchronize).not.toHaveBeenCalled();
  });
});
