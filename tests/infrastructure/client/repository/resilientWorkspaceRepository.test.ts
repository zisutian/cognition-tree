import { describe, expect, it, vi } from "vitest";
import { createLocalFirstWorkspaceRepository } from "../../../../infrastructure/client/repository/resilientWorkspaceRepository";
import type { VersionedRepositoryLoadPolicy } from "../../../../infrastructure/client/repository/resilientVersionedRepository";
import {
  WorkspaceRepositoryBackendConflictError,
  WorkspaceRepositoryLocalConflictError,
  WorkspaceRepositoryRemoteError,
  WorkspaceRepositoryUnavailableError,
  type RemoteWorkspaceSyncRequest,
  type WorkspaceRepository,
  type WorkspaceRepositoryBackend,
} from "../../../../application/workspace/persistence/workspaceRepository";
import type { WorkspaceRepositoryPreparation } from "../../../../application/workspace/persistence/workspaceRepositoryPreparation";
import type { WorkspaceRepositoryContentDto } from "../../../../contracts/workspace/types";
import { createMemoryWorkspaceRepositoryCache } from "../../../../infrastructure/client/repository/workspaceRepositoryCache";
import {
  createWorkspaceRepositoryContent,
  revisionA,
  revisionB,
  revisionC,
} from "../../../support/workspaceRepositoryFixtures";

function createDeferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createRemoteBackend() {
  let content = createWorkspaceRepositoryContent("Remote");
  let revision = revisionA;
  let unavailable = false;
  let conflictRevision: typeof revision | null = null;
  let remoteError: WorkspaceRepositoryRemoteError | null = null;
  const commits: RemoteWorkspaceSyncRequest[] = [];
  const backend: WorkspaceRepositoryBackend = {
    async synchronizeRemoteSnapshot(commit) {
      if (unavailable) {
        throw new WorkspaceRepositoryUnavailableError();
      }
      if (remoteError) {
        throw remoteError;
      }
      if (conflictRevision) {
        throw new WorkspaceRepositoryBackendConflictError(conflictRevision);
      }
      if (commit.base.revision !== revision) {
        throw new WorkspaceRepositoryBackendConflictError(revision);
      }

      commits.push(structuredClone(commit));
      content = structuredClone(commit.content);
      revision = revisionB;
      return {
        outcome: "committed",
        snapshot: { content: structuredClone(content), revision },
      };
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

function createTestProjection(
  content: WorkspaceRepositoryContentDto,
): WorkspaceRepositoryPreparation {
  return {
    contentName: content.workspace.name,
  } as unknown as WorkspaceRepositoryPreparation;
}

function createTestPreparation(
  validateContent: (content: WorkspaceRepositoryContentDto) => void,
) {
  return {
    prepare(content: WorkspaceRepositoryContentDto) {
      validateContent(content);
      return createTestProjection(content);
    },
  };
}

function stageWorkspace(
  repository: WorkspaceRepository,
  content: WorkspaceRepositoryContentDto,
  expectedLocalRevision: Parameters<
    WorkspaceRepository["stageSnapshot"]
  >[0]["expectedLocalRevision"],
) {
  return repository.stageSnapshot({
    content,
    expectedLocalRevision,
    projection: createTestProjection(content),
  });
}

function createRepository(
  remote: ReturnType<typeof createRemoteBackend>,
  cache = createMemoryWorkspaceRepositoryCache(),
  validateContent: (content: WorkspaceRepositoryContentDto) => void =
    () => undefined,
  loadPolicy: VersionedRepositoryLoadPolicy = { mode: "cache-first" },
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
      loadPolicy,
      location: { hostPath: null, serverPath: "/data/repositories/primary" },
      repositoryIdentity: "https://api.test#primary#token-digest",
      preparation: createTestPreparation(validateContent),
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
      { mode: "refresh-remote" },
    );
    const initial = await repository.loadSnapshot();

    remote.setRemote(
      createWorkspaceRepositoryContent("External disk edit"),
      revisionC,
    );
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
      { mode: "refresh-remote" },
    );
    const initial = await repository.loadSnapshot();
    const staged = await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent("Local draft"),
      initial.localRevision,
    );

    remote.setRemote(
      createWorkspaceRepositoryContent("External disk edit"),
      revisionC,
    );
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
      { mode: "refresh-remote" },
    );
    const initial = await repository.loadSnapshot();

    remote.setRemote(
      createWorkspaceRepositoryContent("External disk edit"),
      revisionC,
    );
    const staged = await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent("Local draft"),
      initial.localRevision,
    );

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
      { mode: "refresh-remote" },
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
      { mode: "refresh-remote" },
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
    const storageFailure = new Error("Client cache capacity exceeded");
    vi.spyOn(cache, "create").mockRejectedValue(storageFailure);
    const { repository } = createRepository(remote, cache);

    await expect(repository.loadSnapshot()).rejects.toBe(storageFailure);
  });

  it("does not cache a remote snapshot rejected by semantic content validation", async () => {
    const remote = createRemoteBackend();
    const cache = createMemoryWorkspaceRepositoryCache();
    remote.setRemote(
      createWorkspaceRepositoryContent("Invalid remote"),
      revisionC,
    );
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
    const first = await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent("First pending"),
      initial.localRevision,
    );
    const latest = await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent("Latest pending"),
      first.localRevision,
    );

    await expect(
      stageWorkspace(
        repository,
        createWorkspaceRepositoryContent("Stale writer"),
        first.localRevision,
      ),
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
    const first = await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent("First"),
      initial.localRevision,
    );
    await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent("Latest"),
      first.localRevision,
    );

    const result = await repository.synchronizePendingSnapshot();

    expect(result).toMatchObject({
      pendingChanges: false,
      remoteRevision: revisionB,
      status: "synced",
    });
    expect(remote.commits).toHaveLength(1);
    expect(remote.commits[0]).toMatchObject({
      base: { revision: revisionA },
      content: { workspace: { name: "Latest" } },
    });
  });

  it("keeps a newer stage pending when an in-flight older sync completes", async () => {
    const committedContent = createWorkspaceRepositoryContent(
      "Being synchronized",
    );
    const commit = createDeferred<{
      outcome: "committed";
      snapshot: { content: typeof committedContent; revision: typeof revisionB };
    }>();
    const commitStarted = createDeferred<void>();
    const backend: WorkspaceRepositoryBackend = {
      async synchronizeRemoteSnapshot() {
        commitStarted.resolve();
        return commit.promise;
      },
      async loadRemoteSnapshot() {
        return {
          content: createWorkspaceRepositoryContent("Initial"),
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
      loadPolicy: { mode: "cache-first" },
      location: { hostPath: null, serverPath: "/data/repositories/primary" },
      repositoryIdentity: "primary",
      preparation: createTestPreparation(() => undefined),
    });
    const initial = await repository.loadSnapshot();
    const older = await stageWorkspace(
      repository,
      committedContent,
      initial.localRevision,
    );
    const syncing = repository.synchronizePendingSnapshot();

    await commitStarted.promise;
    const newest = await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent("Newer local stage"),
      older.localRevision,
    );
    commit.resolve({
      outcome: "committed",
      snapshot: { content: committedContent, revision: revisionB },
    });

    await expect(syncing).resolves.toMatchObject({
      pendingChanges: true,
      remoteRevision: revisionB,
      status: "synced",
    });
    const latest = await repository.loadSnapshot();

    expect(latest.localRevision).not.toBe(newest.localRevision);
    expect(latest).toMatchObject({
      content: { workspace: { name: "Newer local stage" } },
      pendingChanges: true,
      remoteRevision: revisionB,
    });
    expect(
      (latest.projection as unknown as { contentName: string }).contentName,
    ).toBe("Newer local stage");
  });

  it("models offline, retryable, and terminal sync failures without deleting pending data", async () => {
    const remote = createRemoteBackend();
    const { repository } = createRepository(remote);
    const initial = await repository.loadSnapshot();
    const staged = await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent("Pending"),
      initial.localRevision,
    );

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
    const pending = await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent("Local pending"),
      initial.localRevision,
    );
    remote.setConflict(revisionC);

    await expect(repository.synchronizePendingSnapshot()).resolves.toEqual({
      localRevision: pending.localRevision,
      remoteRevision: revisionC,
      status: "conflict",
    });

    const latest = await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent("Local after conflict"),
      pending.localRevision,
    );
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "Local after conflict" } },
      localRevision: latest.localRevision,
      pendingChanges: true,
      remoteRevision: revisionC,
    });
  });

  it("rebases different resources and persists both sides of a same-resource conflict", async () => {
    const remote = createRemoteBackend();
    const { repository } = createRepository(remote);
    const initial = await repository.loadSnapshot();
    const initialNoteSource = initial.content.workspace.notes[0]!.source;
    const localNoteSource = initialNoteSource.replace("\nTitle", "\nLocal note");
    const localNote = createWorkspaceRepositoryContent(
      "Remote",
      localNoteSource,
    );

    await stageWorkspace(repository, localNote, initial.localRevision);
    remote.setRemote(
      createWorkspaceRepositoryContent(
        "Remote renamed",
        initialNoteSource,
      ),
      revisionC,
    );
    await expect(repository.synchronizePendingSnapshot()).resolves.toMatchObject({
      pendingChanges: false,
      status: "synced",
    });
    expect(remote.commits.at(-1)?.content).toMatchObject({
      workspace: {
        name: "Remote renamed",
        notes: [{ source: localNoteSource }],
      },
    });

    const rebased = await repository.loadSnapshot();
    const secondLocalNoteSource = localNoteSource.replace(
      "\nLocal note",
      "\nSecond local note",
    );
    const secondRemoteNoteSource = localNoteSource.replace(
      "\nLocal note",
      "\nSecond remote note",
    );
    await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent(
        "Remote renamed",
        secondLocalNoteSource,
      ),
      rebased.localRevision,
    );
    remote.setRemote(
      createWorkspaceRepositoryContent(
        "Second remote name",
        secondRemoteNoteSource,
      ),
      revisionC,
    );
    await expect(repository.synchronizePendingSnapshot()).resolves.toMatchObject({
      remoteRevision: revisionC,
      status: "conflict",
    });
    const conflicted = await repository.loadSnapshot();
    const latestLocalNoteSource = localNoteSource.replace(
      "\nLocal note",
      "\nLatest local note",
    );

    await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent(
        "Remote renamed",
        latestLocalNoteSource,
      ),
      conflicted.localRevision,
    );
    await expect(repository.loadConflict()).resolves.toMatchObject({
      local: {
        workspace: {
          notes: [{ source: latestLocalNoteSource }],
        },
      },
      remote: {
        workspace: {
          name: "Second remote name",
          notes: [{ source: secondRemoteNoteSource }],
        },
      },
      unitIds: ["workspace:note:note-a"],
    });
    await expect(
      repository.keepLocalConflictAndSynchronize(),
    ).resolves.toMatchObject({
      pendingChanges: false,
      status: "synced",
    });
    expect(remote.commits.at(-1)?.content.workspace).toMatchObject({
      name: "Second remote name",
      notes: [{ source: latestLocalNoteSource }],
    });
  });

  it("loads remote content before atomically discarding pending state", async () => {
    const remote = createRemoteBackend();
    const { repository } = createRepository(remote);
    const initial = await repository.loadSnapshot();
    await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent("Local pending"),
      initial.localRevision,
    );

    remote.setUnavailable(true);
    await expect(repository.discardPendingSnapshotAndReload()).rejects.toBeInstanceOf(
      WorkspaceRepositoryUnavailableError,
    );
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "Local pending" } },
      pendingChanges: true,
    });

    remote.setUnavailable(false);
    remote.setRemote(
      createWorkspaceRepositoryContent("Remote replacement"),
      revisionC,
    );
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
    const staged = await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent("Local pending must survive"),
      initial.localRevision,
    );
    const beforeDiscard = await repository.loadSnapshot();

    remote.setRemote(
      createWorkspaceRepositoryContent("Invalid replacement"),
      revisionC,
    );
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
    const firstPending = await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent("Pending before discard"),
      initial.localRevision,
    );
    const remoteLoad = createDeferred<{
      content: ReturnType<typeof createWorkspaceRepositoryContent>;
      revision: typeof revisionC;
    }>();

    vi.spyOn(remote.backend, "loadRemoteSnapshot")
      .mockImplementationOnce(() => remoteLoad.promise);
    const discard = repository.discardPendingSnapshotAndReload();

    await vi.waitFor(() => {
      expect(remote.backend.loadRemoteSnapshot).toHaveBeenCalledTimes(1);
    });
    const newest = await stageWorkspace(
      repository,
      createWorkspaceRepositoryContent(
        "Concurrent newest local stage",
      ),
      firstPending.localRevision,
    );

    remoteLoad.resolve({
      content: createWorkspaceRepositoryContent("Remote replacement"),
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
      loadPolicy: { mode: "cache-first" },
      location: { hostPath: null, serverPath: "/data/repositories/primary" },
      repositoryIdentity: "primary",
      subscribeReconnect(listener) {
        subscription.reconnect = listener;
        return unsubscribe;
      },
      preparation: createTestPreparation(() => undefined),
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
