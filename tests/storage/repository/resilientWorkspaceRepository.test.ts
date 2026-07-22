import { describe, expect, it, vi } from "vitest";
import { createLocalFirstWorkspaceRepository } from "../../../infrastructure/persistence/resilientWorkspaceRepository";
import {
  WorkspaceRepositoryBackendConflictError,
  WorkspaceRepositoryLocalConflictError,
  WorkspaceRepositoryRemoteError,
  WorkspaceRepositoryUnavailableError,
  type RemoteWorkspaceCommit,
  type WorkspaceRepositoryBackend,
} from "../../../application/repository/workspaceRepository";
import { createMemoryWorkspaceRepositoryCache } from "../../../infrastructure/persistence/workspaceRepositoryCache";
import {
  createRepositoryContent,
  revisionA,
  revisionB,
  revisionC,
} from "../repositoryV3Fixtures";

function createDeferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createRemoteBackend() {
  let content = createRepositoryContent("Remote");
  let revision = revisionA;
  let unavailable = false;
  let conflictRevision: typeof revision | null = null;
  let remoteError: WorkspaceRepositoryRemoteError | null = null;
  const commits: RemoteWorkspaceCommit[] = [];
  const backend: WorkspaceRepositoryBackend = {
    async commitRemoteSnapshot(commit) {
      if (unavailable) {
        throw new WorkspaceRepositoryUnavailableError();
      }
      if (remoteError) {
        throw remoteError;
      }
      if (conflictRevision) {
        throw new WorkspaceRepositoryBackendConflictError(conflictRevision);
      }
      if (commit.baseRevision !== revision) {
        throw new WorkspaceRepositoryBackendConflictError(revision);
      }

      commits.push(structuredClone(commit));
      content = structuredClone(commit.content);
      revision = revisionB;
      return { revision };
    },
    async loadRemoteSnapshot() {
      if (unavailable) {
        throw new WorkspaceRepositoryUnavailableError();
      }

      return { content: structuredClone(content), revision };
    },
  };

  return {
    backend,
    commits,
    setConflict(nextRevision: typeof revision | null) {
      conflictRevision = nextRevision;
    },
    setRemote(nextContent: typeof content, nextRevision: typeof revision) {
      content = structuredClone(nextContent);
      revision = nextRevision;
    },
    setRemoteError(error: WorkspaceRepositoryRemoteError | null) {
      remoteError = error;
    },
    setUnavailable(value: boolean) {
      unavailable = value;
    },
  };
}

function createRepository(
  remote: ReturnType<typeof createRemoteBackend>,
  cache = createMemoryWorkspaceRepositoryCache(),
  validateContent: Parameters<
    typeof createLocalFirstWorkspaceRepository
  >[0]["validateContent"] = () => undefined,
  refreshRemoteOnLoad = false,
) {
  let draftSequence = 0;

  return {
    cache,
    repository: createLocalFirstWorkspaceRepository({
      backend: remote.backend,
      cache,
      createDraftId: () =>
        `00000000-0000-4000-8000-${String(++draftSequence).padStart(12, "0")}`,
      label: "Remote catalog label",
      location: { type: "webdav", url: "https://dav.test/primary/" },
      refreshRemoteOnLoad,
      repositoryIdentity: "https://api.test#primary#token-digest",
      validateContent,
    }),
  };
}

describe("local-first workspace repository", () => {
  it("loads a remote snapshot once and then serves the durable local copy", async () => {
    const remote = createRemoteBackend();
    const load = vi.spyOn(remote.backend, "loadRemoteSnapshot");
    const { repository } = createRepository(remote);

    const first = await repository.loadSnapshot();
    remote.setUnavailable(true);
    const cached = await repository.loadSnapshot();

    expect(first).toMatchObject({
      content: { workspace: { name: "Remote" } },
      pendingChanges: false,
      remoteRevision: revisionA,
    });
    expect(first.localRevision).toMatch(/^draft:/);
    expect(cached).toEqual(first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("refreshes clean Local cache state from the remote working tree on every load", async () => {
    const remote = createRemoteBackend();
    const { repository } = createRepository(
      remote,
      undefined,
      () => undefined,
      true,
    );
    const initial = await repository.loadSnapshot();

    remote.setRemote(createRepositoryContent("External disk edit"), revisionC);
    const refreshed = await repository.loadSnapshot();

    expect(refreshed).toMatchObject({
      conflictRevision: null,
      content: { workspace: { name: "External disk edit" } },
      pendingChanges: false,
      remoteRevision: revisionC,
    });
    expect(refreshed.localRevision).not.toBe(initial.localRevision);
  });

  it("keeps a pending Local draft and publishes conflict when disk changed", async () => {
    const remote = createRemoteBackend();
    const { repository } = createRepository(
      remote,
      undefined,
      () => undefined,
      true,
    );
    const initial = await repository.loadSnapshot();
    const staged = await repository.stageSnapshot({
      content: createRepositoryContent("Local draft"),
      expectedLocalRevision: initial.localRevision,
    });

    remote.setRemote(createRepositoryContent("External disk edit"), revisionC);
    const refreshed = await repository.loadSnapshot();

    expect(refreshed).toMatchObject({
      conflictRevision: revisionC,
      content: { workspace: { name: "Local draft" } },
      localRevision: staged.localRevision,
      pendingChanges: true,
      remoteRevision: revisionC,
    });
  });

  it("does not rescan a Local working tree as an internal precondition of stage", async () => {
    const remote = createRemoteBackend();
    const load = vi.spyOn(remote.backend, "loadRemoteSnapshot");
    const { repository } = createRepository(
      remote,
      undefined,
      () => undefined,
      true,
    );
    const initial = await repository.loadSnapshot();

    remote.setRemote(createRepositoryContent("External disk edit"), revisionC);
    const staged = await repository.stageSnapshot({
      content: createRepositoryContent("Local draft"),
      expectedLocalRevision: initial.localRevision,
    });

    expect(staged.localRevision).not.toBe(initial.localRevision);
    expect(load).toHaveBeenCalledTimes(1);
    await expect(repository.synchronizePendingSnapshot()).resolves.toEqual({
      localRevision: staged.localRevision,
      remoteRevision: revisionC,
      status: "conflict",
    });
  });

  it("opens the durable Local draft while the server is offline", async () => {
    const remote = createRemoteBackend();
    const { repository } = createRepository(
      remote,
      undefined,
      () => undefined,
      true,
    );
    const initial = await repository.loadSnapshot();

    remote.setUnavailable(true);
    await expect(repository.loadSnapshot()).resolves.toEqual(initial);
  });

  it("does not hide a stable-scan repository_busy failure behind the cache", async () => {
    const remote = createRemoteBackend();
    const { repository } = createRepository(
      remote,
      undefined,
      () => undefined,
      true,
    );
    await repository.loadSnapshot();
    const busy = new WorkspaceRepositoryRemoteError("working tree changed", {
      code: "repository_busy",
      retryable: true,
    });

    vi.spyOn(remote.backend, "loadRemoteSnapshot").mockRejectedValueOnce(busy);
    await expect(repository.loadSnapshot()).rejects.toBe(busy);
  });

  it("preserves the local storage failure when initialization did not race", async () => {
    const remote = createRemoteBackend();
    const cache = createMemoryWorkspaceRepositoryCache();
    const storageFailure = new Error("IndexedDB quota exceeded");
    vi.spyOn(cache, "create").mockRejectedValue(storageFailure);
    const { repository } = createRepository(remote, cache);

    await expect(repository.loadSnapshot()).rejects.toBe(storageFailure);
  });

  it("does not cache a remote snapshot rejected by semantic content validation", async () => {
    const remote = createRemoteBackend();
    const cache = createMemoryWorkspaceRepositoryCache();
    remote.setRemote(createRepositoryContent("Invalid remote"), revisionC);
    const validationFailure = new Error("canonical metadata is invalid");
    const { repository } = createRepository(remote, cache, (content) => {
      if (content.workspace.name === "Invalid remote") {
        throw validationFailure;
      }
    });

    await expect(repository.loadSnapshot()).rejects.toBe(validationFailure);
    await expect(
      cache.load("https://api.test#primary#token-digest"),
    ).resolves.toBeNull();
  });

  it("stages only with the current draft revision and restores the latest pending content", async () => {
    const remote = createRemoteBackend();
    const { cache, repository } = createRepository(remote);
    const initial = await repository.loadSnapshot();
    const first = await repository.stageSnapshot({
      content: createRepositoryContent("First pending"),
      expectedLocalRevision: initial.localRevision,
    });
    const latest = await repository.stageSnapshot({
      content: createRepositoryContent("Latest pending"),
      expectedLocalRevision: first.localRevision,
    });

    await expect(
      repository.stageSnapshot({
        content: createRepositoryContent("Stale writer"),
        expectedLocalRevision: first.localRevision,
      }),
    ).rejects.toBeInstanceOf(WorkspaceRepositoryLocalConflictError);

    const restored = createRepository(remote, cache).repository;
    await expect(restored.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "Latest pending" } },
      localRevision: latest.localRevision,
      pendingChanges: true,
      remoteRevision: revisionA,
    });
  });

  it("keeps the original remote base while replacing pending local content", async () => {
    const remote = createRemoteBackend();
    const { repository } = createRepository(remote);
    const initial = await repository.loadSnapshot();
    const first = await repository.stageSnapshot({
      content: createRepositoryContent("First"),
      expectedLocalRevision: initial.localRevision,
    });
    await repository.stageSnapshot({
      content: createRepositoryContent("Latest"),
      expectedLocalRevision: first.localRevision,
    });

    const result = await repository.synchronizePendingSnapshot();

    expect(result).toMatchObject({
      pendingChanges: false,
      remoteRevision: revisionB,
      status: "synced",
    });
    expect(remote.commits).toHaveLength(1);
    expect(remote.commits[0]).toMatchObject({
      baseRevision: revisionA,
      content: { workspace: { name: "Latest" } },
    });
  });

  it("keeps a newer stage pending when an in-flight older sync completes", async () => {
    const commit = createDeferred<{ revision: typeof revisionB }>();
    const commitStarted = createDeferred<void>();
    const backend: WorkspaceRepositoryBackend = {
      async commitRemoteSnapshot() {
        commitStarted.resolve();
        return commit.promise;
      },
      async loadRemoteSnapshot() {
        return {
          content: createRepositoryContent("Initial"),
          revision: revisionA,
        };
      },
    };
    let sequence = 0;
    const repository = createLocalFirstWorkspaceRepository({
      backend,
      cache: createMemoryWorkspaceRepositoryCache(),
      createDraftId: () =>
        `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
      label: "Remote",
      location: { type: "webdav", url: "https://dav.test/primary/" },
      repositoryIdentity: "primary",
      validateContent: () => undefined,
    });
    const initial = await repository.loadSnapshot();
    const older = await repository.stageSnapshot({
      content: createRepositoryContent("Being synchronized"),
      expectedLocalRevision: initial.localRevision,
    });
    const syncing = repository.synchronizePendingSnapshot();

    await commitStarted.promise;
    const newest = await repository.stageSnapshot({
      content: createRepositoryContent("Newer local stage"),
      expectedLocalRevision: older.localRevision,
    });
    commit.resolve({ revision: revisionB });

    await expect(syncing).resolves.toMatchObject({
      localRevision: newest.localRevision,
      pendingChanges: true,
      remoteRevision: revisionB,
      status: "synced",
    });
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "Newer local stage" } },
      pendingChanges: true,
      remoteRevision: revisionB,
    });
  });

  it("models offline, retryable, and terminal sync failures without deleting pending data", async () => {
    const remote = createRemoteBackend();
    const { repository } = createRepository(remote);
    const initial = await repository.loadSnapshot();
    const staged = await repository.stageSnapshot({
      content: createRepositoryContent("Pending"),
      expectedLocalRevision: initial.localRevision,
    });

    remote.setUnavailable(true);
    await expect(repository.synchronizePendingSnapshot()).resolves.toEqual({
      localRevision: staged.localRevision,
      pendingChanges: true,
      remoteRevision: revisionA,
      status: "offline",
    });

    remote.setUnavailable(false);
    remote.setRemoteError(new WorkspaceRepositoryRemoteError("busy", {
      code: "repository_busy",
      retryable: true,
    }));
    await expect(repository.synchronizePendingSnapshot()).resolves.toEqual({
      localRevision: staged.localRevision,
      pendingChanges: true,
      remoteRevision: revisionA,
      status: "offline",
    });

    remote.setRemoteError(new WorkspaceRepositoryRemoteError("bad request"));
    await expect(repository.synchronizePendingSnapshot()).resolves.toEqual({
      localRevision: staged.localRevision,
      message: "bad request",
      remoteRevision: revisionA,
      status: "sync-error",
    });

    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "Pending" } },
      pendingChanges: true,
    });
  });

  it("keeps conflict as local persistence state and allows newer local stages", async () => {
    const remote = createRemoteBackend();
    const { repository } = createRepository(remote);
    const initial = await repository.loadSnapshot();
    const pending = await repository.stageSnapshot({
      content: createRepositoryContent("Local pending"),
      expectedLocalRevision: initial.localRevision,
    });
    remote.setConflict(revisionC);

    await expect(repository.synchronizePendingSnapshot()).resolves.toEqual({
      localRevision: pending.localRevision,
      remoteRevision: revisionC,
      status: "conflict",
    });

    const latest = await repository.stageSnapshot({
      content: createRepositoryContent("Local after conflict"),
      expectedLocalRevision: pending.localRevision,
    });
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "Local after conflict" } },
      localRevision: latest.localRevision,
      pendingChanges: true,
      remoteRevision: revisionC,
    });
  });

  it("loads remote content before atomically discarding pending state", async () => {
    const remote = createRemoteBackend();
    const { repository } = createRepository(remote);
    const initial = await repository.loadSnapshot();
    await repository.stageSnapshot({
      content: createRepositoryContent("Local pending"),
      expectedLocalRevision: initial.localRevision,
    });

    remote.setUnavailable(true);
    await expect(repository.discardPendingSnapshotAndReload()).rejects.toBeInstanceOf(
      WorkspaceRepositoryUnavailableError,
    );
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "Local pending" } },
      pendingChanges: true,
    });

    remote.setUnavailable(false);
    remote.setRemote(createRepositoryContent("Remote replacement"), revisionC);
    await expect(repository.discardPendingSnapshotAndReload()).resolves.toMatchObject({
      content: { workspace: { name: "Remote replacement" } },
      pendingChanges: false,
      remoteRevision: revisionC,
    });
  });

  it("keeps content, pending base, and local revision unchanged when discard validation fails", async () => {
    const remote = createRemoteBackend();
    const validationFailure = new Error("remote canonical metadata is invalid");
    const { repository } = createRepository(remote, undefined, (content) => {
      if (content.workspace.name === "Invalid replacement") {
        throw validationFailure;
      }
    });
    const initial = await repository.loadSnapshot();
    const staged = await repository.stageSnapshot({
      content: createRepositoryContent("Local pending must survive"),
      expectedLocalRevision: initial.localRevision,
    });
    const beforeDiscard = await repository.loadSnapshot();

    remote.setRemote(createRepositoryContent("Invalid replacement"), revisionC);
    await expect(repository.discardPendingSnapshotAndReload()).rejects.toBe(
      validationFailure,
    );
    await expect(repository.loadSnapshot()).resolves.toEqual(beforeDiscard);
    expect(beforeDiscard).toMatchObject({
      content: { workspace: { name: "Local pending must survive" } },
      localRevision: staged.localRevision,
      pendingChanges: true,
      remoteRevision: revisionA,
    });
  });

  it("does not discard a newer local stage completed while the remote snapshot is loading", async () => {
    const remote = createRemoteBackend();
    const { repository } = createRepository(remote);
    const initial = await repository.loadSnapshot();
    const firstPending = await repository.stageSnapshot({
      content: createRepositoryContent("Pending before discard"),
      expectedLocalRevision: initial.localRevision,
    });
    const remoteLoad = createDeferred<{
      content: ReturnType<typeof createRepositoryContent>;
      revision: typeof revisionC;
    }>();

    vi.spyOn(remote.backend, "loadRemoteSnapshot")
      .mockImplementationOnce(() => remoteLoad.promise);
    const discard = repository.discardPendingSnapshotAndReload();

    await vi.waitFor(() => {
      expect(remote.backend.loadRemoteSnapshot).toHaveBeenCalledTimes(1);
    });
    const newest = await repository.stageSnapshot({
      content: createRepositoryContent("Concurrent newest local stage"),
      expectedLocalRevision: firstPending.localRevision,
    });

    remoteLoad.resolve({
      content: createRepositoryContent("Remote replacement"),
      revision: revisionC,
    });
    await expect(discard).rejects.toBeInstanceOf(
      WorkspaceRepositoryLocalConflictError,
    );
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "Concurrent newest local stage" } },
      localRevision: newest.localRevision,
      pendingChanges: true,
    });
  });

  it("exposes the backend reconnect subscription without replay or wrapping", () => {
    const remote = createRemoteBackend();
    const subscription: { reconnect: () => void } = {
      reconnect: () => undefined,
    };
    const unsubscribe = vi.fn();
    const repository = createLocalFirstWorkspaceRepository({
      backend: remote.backend,
      cache: createMemoryWorkspaceRepositoryCache(),
      createDraftId: () => "00000000-0000-4000-8000-000000000001",
      label: "Remote",
      location: { type: "webdav", url: "https://dav.test/primary/" },
      repositoryIdentity: "primary",
      subscribeReconnect(listener) {
        subscription.reconnect = listener;
        return unsubscribe;
      },
      validateContent: () => undefined,
    });
    const listener = vi.fn();

    const dispose = repository.subscribeReconnect(listener);
    expect(listener).not.toHaveBeenCalled();
    subscription.reconnect();
    expect(listener).toHaveBeenCalledTimes(1);
    dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
