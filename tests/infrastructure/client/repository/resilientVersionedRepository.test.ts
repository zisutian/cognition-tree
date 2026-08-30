import { describe, expect, it, vi } from "vitest";
import { createLocalFirstVersionedRepository } from "../../../../infrastructure/client/repository/resilientVersionedRepository";
import { createMemoryVersionedRepositoryCache } from "../../../../infrastructure/client/repository/versionedRepositoryCache";
import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryBackendMergeConflictError,
  VersionedRepositoryUnavailableError,
} from "../../../../application/persistence/versionedRepository";

type Content = { records: Array<{ done: boolean; text: string }> };
type Revision = `revision:${number}`;
type LocalRevision = `local:${number}`;

function deferred<Value>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((promiseResolve, promiseReject) => {
    reject = promiseReject;
    resolve = promiseResolve;
  });

  return { promise, reject, resolve };
}

function parseContent(value: unknown): Content {
  if (
    !value || typeof value !== "object" ||
    !Array.isArray((value as Partial<Content>).records)
  ) {
    throw new Error("invalid generic content");
  }
  return structuredClone(value as Content);
}

const contentPreparation = {
  prepare: (content: Content) => parseContent(content),
};

function replaceContent(
  before: {
    content: Content;
    localRevision: LocalRevision;
    projection: Content;
  },
  content: Content,
  projection = parseContent(content),
) {
  return {
    after: { content, projection },
    baseLocalRevision: before.localRevision,
    before: { content: before.content, projection: before.projection },
  };
}

describe("local-first versioned repository", () => {
  it("prepares a cold snapshot once and stages an existing projection without re-preparing", async () => {
    const prepare = vi.fn((content: Content) => parseContent(content));
    let localIndex = 0;
    const repository = createLocalFirstVersionedRepository({
      backend: {
        synchronizeRemoteSnapshot: async (request) => ({
          outcome: "committed" as const,
          snapshot: {
            content: request.content,
            revision: "revision:2" as const,
          },
        }),
        loadRemoteSnapshot: async () => ({
          content: { records: [] },
          revision: "revision:1" as const,
        }),
      },
      cache: createMemoryVersionedRepositoryCache<
        Content,
        Revision,
        LocalRevision
      >(),
      createLocalRevision: () => `local:${localIndex += 1}`,
      label: "generic",
      loadPolicy: { mode: "cache-first" },
      location: { kind: "memory" },
      repositoryIdentity: "generic:preparation-count",
      preparation: { prepare },
    });
    const initial = await repository.loadSnapshot();

    expect(prepare).toHaveBeenCalledTimes(1);
    expect((await repository.loadSnapshot()).projection).toBe(
      initial.projection,
    );
    expect(prepare).toHaveBeenCalledTimes(1);

    const content = { records: [{ done: false, text: "prepared" }] };
    const projection = parseContent(content);

    await repository.stageSnapshot(replaceContent(initial, content, projection));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect((await repository.loadSnapshot()).projection).toBe(projection);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("persists an injected content model without WorkspaceData semantics", async () => {
    const commit = vi.fn(async (request: {
      base: { content: Content; revision: Revision };
      content: Content;
    }) => ({
      outcome: "committed" as const,
      snapshot: { content: request.content, revision: "revision:2" as const },
    }));
    let localIndex = 0;
    const repository = createLocalFirstVersionedRepository({
      backend: {
        synchronizeRemoteSnapshot: commit,
        loadRemoteSnapshot: async () => ({
          content: { records: [] },
          revision: "revision:1" as const,
        }),
      },
      cache: createMemoryVersionedRepositoryCache<
        Content,
        Revision,
        LocalRevision
      >(),
      createLocalRevision: () => `local:${localIndex += 1}`,
      label: "generic",
      loadPolicy: { mode: "cache-first" },
      location: { kind: "memory" },
      repositoryIdentity: "generic:one",
      preparation: contentPreparation,
    });
    const initial = await repository.loadSnapshot();
    const content = { records: [{ done: false, text: "independent" }] };

    await repository.stageSnapshot(replaceContent(initial, content));
    const synchronized = await repository.synchronizePendingSnapshot();

    expect(synchronized.status).toBe("synced");
    expect(synchronized.transitions.at(-1)?.snapshot).toMatchObject({
      pendingChanges: false,
      remoteRevision: "revision:2",
    });
    expect(commit).toHaveBeenCalledWith({
      base: { content: { records: [] }, revision: "revision:1" },
      content,
    });
  });

  it("keeps a draft created while a remote commit is in flight pending on the committed revision", async () => {
    const cache = createMemoryVersionedRepositoryCache<
      Content,
      Revision,
      LocalRevision
    >();
    let localIndex = 0;
    let finishCommit!: (result: {
      outcome: "committed";
      snapshot: { content: Content; revision: Revision };
    }) => void;
    let markCommitStarted!: () => void;
    const commitStarted = new Promise<void>((resolve) => {
      markCommitStarted = resolve;
    });
    const repository = createLocalFirstVersionedRepository({
      backend: {
        synchronizeRemoteSnapshot: vi.fn(async () => {
          markCommitStarted();
          return await new Promise<{
            outcome: "committed";
            snapshot: { content: Content; revision: Revision };
          }>((resolve) => {
            finishCommit = resolve;
          });
        }),
        loadRemoteSnapshot: async () => ({
          content: { records: [] },
          revision: "revision:1" as const,
        }),
      },
      cache,
      createLocalRevision: () => `local:${localIndex += 1}`,
      label: "generic",
      loadPolicy: { mode: "cache-first" },
      location: { kind: "memory" },
      mergeContent: (_base, local) => ({ ...local, status: "merged" }),
      repositoryIdentity: "generic:in-flight-draft",
      preparation: contentPreparation,
    });
    const initial = await repository.loadSnapshot();
    const submitted = { records: [{ done: false, text: "submitted" }] };

    await repository.stageSnapshot(replaceContent(initial, submitted));
    const submitting = repository.synchronizePendingSnapshot();

    await commitStarted;
    const duringRequest = await repository.loadSnapshot();
    const continued = {
      records: [
        { done: false, text: "submitted" },
        { done: false, text: "continued while syncing" },
      ],
    };

    await repository.stageSnapshot(replaceContent(duringRequest, continued));
    finishCommit({
      outcome: "committed",
      snapshot: { content: submitted, revision: "revision:2" },
    });

    const synchronized = await submitting;

    expect(synchronized.status).toBe("synced");
    expect(synchronized.transitions.at(-1)?.snapshot).toMatchObject({
      pendingChanges: true,
      remoteRevision: "revision:2",
    });
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: continued,
      pendingChanges: true,
      remoteRevision: "revision:2",
    });
    await expect(cache.loadSyncContext("generic:in-flight-draft")).resolves
      .toMatchObject({ baseContent: submitted, conflict: null });
  });

  it("continues a prepared local change on the synchronized snapshot instead of overwriting remote facts", async () => {
    let localIndex = 0;
    let pauseNextStage = false;
    const baseRecord = { done: false, text: "base" };
    const localRecord = { done: false, text: "local" };
    const remoteRecord = { done: false, text: "remote" };
    const continuedRecord = { done: false, text: "continued" };
    const base = { records: [baseRecord] };
    const submitted = { records: [baseRecord, localRecord] };
    const synchronizedContent = {
      records: [baseRecord, localRecord, remoteRecord],
    };
    const stageStarted = deferred<void>();
    const releaseStage = deferred<void>();
    const durableCache = createMemoryVersionedRepositoryCache<
      Content,
      Revision,
      LocalRevision
    >();
    const cache: typeof durableCache = {
      ...durableCache,
      async stage(input) {
        if (pauseNextStage) {
          pauseNextStage = false;
          stageStarted.resolve(undefined);
          await releaseStage.promise;
        }
        return durableCache.stage(input);
      },
    };
    const repository = createLocalFirstVersionedRepository({
      backend: {
        loadRemoteSnapshot: async () => ({
          content: base,
          revision: "revision:1" as const,
        }),
        synchronizeRemoteSnapshot: async () => ({
          outcome: "auto-merged" as const,
          snapshot: {
            content: synchronizedContent,
            revision: "revision:2" as const,
          },
        }),
      },
      cache,
      createLocalRevision: () => `local:${localIndex += 1}`,
      label: "generic",
      loadPolicy: { mode: "cache-first" },
      location: { kind: "memory" },
      mergeContent: (_base, local, remote) => {
        const content = {
          records: [...new Map(
            [...remote.content.records, ...local.content.records]
              .map((record) => [record.text, record]),
          ).values()],
        };

        return {
          content,
          projection: parseContent(content),
          status: "merged" as const,
        };
      },
      preparation: contentPreparation,
      repositoryIdentity: "generic:continued-after-sync",
    });
    const initial = await repository.loadSnapshot();
    const submittedTransition = await repository.stageSnapshot(
      replaceContent(initial, submitted),
    );
    const beforeContinuation = submittedTransition.snapshot;
    const continued = {
      records: [baseRecord, localRecord, continuedRecord],
    };

    pauseNextStage = true;
    const continuing = repository.stageSnapshot(
      replaceContent(beforeContinuation, continued),
    );
    await stageStarted.promise;
    const synchronized = await repository.synchronizePendingSnapshot();
    const synchronizedSnapshot = synchronized.transitions.at(-1)!.snapshot;

    expect(synchronizedSnapshot.content).toEqual(synchronizedContent);
    releaseStage.resolve(undefined);
    const continuedTransition = await continuing;

    expect(continuedTransition.previousLocalRevision).toBe(
      synchronizedSnapshot.localRevision,
    );
    expect(continuedTransition.snapshot).toMatchObject({
      content: {
        records: [baseRecord, localRecord, remoteRecord, continuedRecord],
      },
      pendingChanges: true,
      remoteRevision: "revision:2",
    });
  });

  it("preserves cached local content across offline reload and projects CAS conflict", async () => {
    const cache = createMemoryVersionedRepositoryCache<
      Content,
      Revision,
      LocalRevision
    >();
    let offline = false;
    let localIndex = 0;
    const repository = createLocalFirstVersionedRepository({
      backend: {
        async synchronizeRemoteSnapshot() {
          throw new VersionedRepositoryBackendConflictError(
            "revision:9" as Revision,
          );
        },
        async loadRemoteSnapshot() {
          if (offline) {
            throw new VersionedRepositoryUnavailableError("offline");
          }
          return {
            content: { records: [] },
            revision: "revision:1" as Revision,
          };
        },
      },
      cache,
      createLocalRevision: () => `local:${localIndex += 1}`,
      label: "generic",
      loadPolicy: { mode: "refresh-remote" },
      location: { kind: "memory" },
      repositoryIdentity: "generic:two",
      preparation: contentPreparation,
    });
    const initial = await repository.loadSnapshot();

    const content = { records: [{ done: true, text: "cached" }] };

    await repository.stageSnapshot(replaceContent(initial, content));
    offline = true;
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: { records: [{ done: true, text: "cached" }] },
      pendingChanges: true,
    });
    const conflicted = await repository.synchronizePendingSnapshot();

    expect(conflicted.status).toBe("conflict");
    expect(conflicted.transitions.at(-1)?.snapshot).toMatchObject({
      conflictRevision: "revision:9",
      remoteRevision: "revision:9",
    });
  });

  it("records server conflict units only after rereading the exact reported revision", async () => {
    let remoteLoad = 0;
    let localIndex = 0;
    const base = { records: [] };
    const remote = { records: [{ done: false, text: "remote" }] };
    const repository = createLocalFirstVersionedRepository({
      backend: {
        loadRemoteSnapshot: async () => {
          remoteLoad += 1;
          return remoteLoad === 1
            ? { content: base, revision: "revision:1" as const }
            : { content: remote, revision: "revision:2" as const };
        },
        synchronizeRemoteSnapshot: async () => {
          throw new VersionedRepositoryBackendMergeConflictError({
            baseRevision: "revision:1" as const,
            currentRevision: "revision:2" as const,
            unitIds: ["record:shared"],
          });
        },
      },
      cache: createMemoryVersionedRepositoryCache<
        Content,
        Revision,
        LocalRevision
      >(),
      createLocalRevision: () => `local:${localIndex += 1}`,
      label: "generic",
      loadPolicy: { mode: "cache-first" },
      location: { kind: "memory" },
      mergeContent: () => ({ status: "conflict", unitIds: ["local"] }),
      preparation: contentPreparation,
      repositoryIdentity: "generic:server-conflict",
    });
    const initial = await repository.loadSnapshot();
    const local = { records: [{ done: false, text: "local" }] };

    await repository.stageSnapshot(replaceContent(initial, local));
    const conflicted = await repository.synchronizePendingSnapshot();

    expect(conflicted.status).toBe("conflict");
    expect(conflicted.transitions.at(-1)?.snapshot).toMatchObject({
      conflictRevision: "revision:2",
      remoteRevision: "revision:2",
    });
    await expect(repository.loadConflict()).resolves.toEqual({
      base,
      local,
      remote,
      remoteRevision: "revision:2",
      unitIds: ["record:shared"],
    });
  });

  it("resubmits the original base when conflict recovery observes a newer revision", async () => {
    let remoteLoad = 0;
    let syncCalls = 0;
    let localIndex = 0;
    const base = { records: [] };
    const desired = { records: [{ done: false, text: "local" }] };
    const repository = createLocalFirstVersionedRepository({
      backend: {
        loadRemoteSnapshot: async () => {
          remoteLoad += 1;
          return {
            content: base,
            revision: (remoteLoad === 1 ? "revision:1" : "revision:3") as Revision,
          };
        },
        synchronizeRemoteSnapshot: async (request) => {
          syncCalls += 1;
          if (syncCalls === 1) {
            throw new VersionedRepositoryBackendMergeConflictError({
              baseRevision: "revision:1" as const,
              currentRevision: "revision:2" as const,
              unitIds: ["record:old"],
            });
          }
          expect(request.base).toEqual({ content: base, revision: "revision:1" });
          return {
            outcome: "auto-merged" as const,
            snapshot: { content: desired, revision: "revision:4" as const },
          };
        },
      },
      cache: createMemoryVersionedRepositoryCache<
        Content,
        Revision,
        LocalRevision
      >(),
      createLocalRevision: () => `local:${localIndex += 1}`,
      label: "generic",
      loadPolicy: { mode: "cache-first" },
      location: { kind: "memory" },
      mergeContent: (_base, local) => ({ ...local, status: "merged" }),
      preparation: contentPreparation,
      repositoryIdentity: "generic:conflict-retry",
    });
    const initial = await repository.loadSnapshot();

    await repository.stageSnapshot(replaceContent(initial, desired));
    const synchronized = await repository.synchronizePendingSnapshot();

    expect(synchronized.status).toBe("synced");
    expect(synchronized.transitions.at(-1)?.snapshot).toMatchObject({
      pendingChanges: false,
      remoteRevision: "revision:4",
    });
    expect(syncCalls).toBe(2);
    await expect(repository.loadConflict()).resolves.toBeNull();
  });
});
