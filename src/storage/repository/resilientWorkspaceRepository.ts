import type { WorkspaceRepositoryCache } from "./workspaceRepositoryCache";
import type {
  LocalDraftRevision,
  WorkspaceRepository,
  WorkspaceRepositoryBackend,
  WorkspaceRepositoryContentValidator,
  WorkspaceRepositorySnapshot,
  WorkspaceRepositorySyncResult,
} from "./workspaceRepository";
import {
  createLocalDraftRevision,
  WorkspaceRepositoryBackendConflictError,
  WorkspaceRepositoryLocalConflictError,
  WorkspaceRepositoryRemoteError,
  WorkspaceRepositoryUnavailableError,
} from "./workspaceRepository";

type LocalFirstWorkspaceRepositoryOptions = {
  backend: WorkspaceRepositoryBackend;
  cache: WorkspaceRepositoryCache;
  createDraftId: () => string;
  label: string;
  location: WorkspaceRepository["location"];
  refreshRemoteOnLoad?: boolean;
  repositoryIdentity: string | Promise<string>;
  subscribeReconnect?: (listener: () => void) => () => void;
  validateContent: WorkspaceRepositoryContentValidator;
};

function toSnapshot(
  state: Awaited<ReturnType<WorkspaceRepositoryCache["load"]>> & {},
): WorkspaceRepositorySnapshot {
  return {
    conflictRevision:
      state.pendingBaseRevision !== null &&
      state.remoteRevision !== null &&
      state.pendingBaseRevision !== state.remoteRevision
        ? state.remoteRevision
        : null,
    content: state.content,
    localRevision: state.localRevision,
    pendingChanges: state.pendingBaseRevision !== null,
    remoteRevision: state.remoteRevision,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Repository synchronization failed";
}

function isRetryableRemoteError(error: unknown) {
  return (
    error instanceof WorkspaceRepositoryUnavailableError ||
    (error instanceof WorkspaceRepositoryRemoteError && error.retryable)
  );
}

function canUseCachedSnapshot(error: unknown) {
  return isRetryableRemoteError(error) &&
    !(error instanceof WorkspaceRepositoryRemoteError &&
      error.code === "repository_busy");
}

export function createLocalFirstWorkspaceRepository({
  backend,
  cache,
  createDraftId,
  label,
  location,
  refreshRemoteOnLoad = false,
  repositoryIdentity,
  subscribeReconnect = () => () => undefined,
  validateContent,
}: LocalFirstWorkspaceRepositoryOptions): WorkspaceRepository {
  let activeLoad: Promise<WorkspaceRepositorySnapshot> | null = null;
  let activeSync: Promise<WorkspaceRepositorySyncResult> | null = null;
  let initialized = false;
  const resolveIdentity = () => Promise.resolve(repositoryIdentity);
  const nextLocalRevision = () => createLocalDraftRevision(createDraftId);

  const reconcileRemoteSnapshot = async (
    identity: string,
    remote: Awaited<ReturnType<WorkspaceRepositoryBackend["loadRemoteSnapshot"]>>,
  ) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await cache.load(identity);

      if (!current) {
        throw new Error(
          "Local repository state disappeared during remote refresh.",
        );
      }

      validateContent(current.content);
      if (current.pendingBaseRevision) {
        const refreshed = current.remoteRevision === remote.revision
          ? current
          : await cache.recordConflict({
              currentRemoteRevision: remote.revision,
              identity,
            });

        return toSnapshot(refreshed);
      }

      if (current.remoteRevision === remote.revision) {
        return toSnapshot(current);
      }

      try {
        return toSnapshot(
          await cache.replaceFromRemote({
            expectedLocalRevision: current.localRevision,
            identity,
            localRevision: nextLocalRevision(),
            snapshot: remote,
          }),
        );
      } catch (error) {
        if (!(error instanceof WorkspaceRepositoryLocalConflictError)) {
          throw error;
        }
      }
    }

    throw new WorkspaceRepositoryRemoteError(
      "Local repository state kept changing during remote refresh.",
      { code: "repository_busy", retryable: true },
    );
  };

  const runExplicitLoad = async () => {
    const identity = await resolveIdentity();
    const local = await cache.load(identity);

    if (local) {
      validateContent(local.content);
      if (!refreshRemoteOnLoad) {
        return toSnapshot(local);
      }

      let remote;

      try {
        remote = await backend.loadRemoteSnapshot();
      } catch (error) {
        if (canUseCachedSnapshot(error)) {
          return toSnapshot(await cache.load(identity) ?? local);
        }

        throw error;
      }

      validateContent(remote.content);
      return reconcileRemoteSnapshot(identity, remote);
    }

    const remote = await backend.loadRemoteSnapshot();

    validateContent(remote.content);

    try {
      return toSnapshot(
        await cache.create({
          identity,
          localRevision: nextLocalRevision(),
          snapshot: remote,
        }),
      );
    } catch (error) {
      const concurrentlyCreated = await cache.load(identity);

      if (!concurrentlyCreated) {
        throw error;
      }

      validateContent(concurrentlyCreated.content);
      return toSnapshot(concurrentlyCreated);
    }
  };

  const loadSnapshot = () => {
    activeLoad ??= runExplicitLoad().then((snapshot) => {
      initialized = true;
      return snapshot;
    }).finally(() => {
      activeLoad = null;
    });
    return activeLoad;
  };
  const ensureInitialized = async () => {
    if (!initialized) {
      await loadSnapshot();
    }
  };

  const synchronize = async (): Promise<WorkspaceRepositorySyncResult> => {
    const identity = await resolveIdentity();
    await ensureInitialized();
    const local = await cache.load(identity);

    if (!local) {
      throw new Error("Local repository state disappeared during synchronization.");
    }

    if (!local.pendingBaseRevision) {
      return {
        localRevision: local.localRevision,
        pendingChanges: false,
        remoteRevision: local.remoteRevision,
        status: "synced",
      };
    }

    try {
      const committed = await backend.commitRemoteSnapshot({
        baseRevision: local.pendingBaseRevision,
        content: local.content,
      });
      const current = await cache.completeSync({
        committedRemoteRevision: committed.revision,
        expectedLocalRevision: local.localRevision,
        identity,
      });

      return {
        localRevision: current.localRevision,
        pendingChanges: current.pendingBaseRevision !== null,
        remoteRevision: current.remoteRevision,
        status: "synced",
      };
    } catch (error) {
      if (error instanceof WorkspaceRepositoryBackendConflictError) {
        const current = await cache.recordConflict({
          currentRemoteRevision: error.currentRevision,
          identity,
        });

        return {
          localRevision: current.localRevision,
          remoteRevision: error.currentRevision,
          status: "conflict",
        };
      }

      const current = await cache.load(identity);

      if (!current) {
        throw error;
      }

      if (isRetryableRemoteError(error)) {
        return {
          localRevision: current.localRevision,
          pendingChanges: current.pendingBaseRevision !== null,
          remoteRevision: current.remoteRevision,
          status: "offline",
        };
      }

      return {
        localRevision: current.localRevision,
        message: getErrorMessage(error),
        remoteRevision: current.remoteRevision,
        status: "sync-error",
      };
    }
  };

  return {
    label,
    location,
    async discardPendingSnapshotAndReload() {
      const identity = await resolveIdentity();
      await ensureInitialized();
      const current = await cache.load(identity);

      if (!current) {
        throw new Error("Local repository state disappeared before discard.");
      }

      const remote = await backend.loadRemoteSnapshot();

      validateContent(remote.content);
      const replaced = await cache.replaceFromRemote({
        expectedLocalRevision: current.localRevision,
        identity,
        localRevision: nextLocalRevision(),
        snapshot: remote,
      });

      return toSnapshot(replaced);
    },
    loadSnapshot,
    async stageSnapshot({ content, expectedLocalRevision }) {
      validateContent(content);
      await ensureInitialized();
      const identity = await resolveIdentity();
      const state = await cache.stage({
        content,
        expectedLocalRevision,
        identity,
        localRevision: nextLocalRevision(),
      });

      return { localRevision: state.localRevision };
    },
    subscribeReconnect,
    synchronizePendingSnapshot() {
      activeSync ??= synchronize().finally(() => {
        activeSync = null;
      });
      return activeSync;
    },
  };
}

export function isSameLocalRevision(
  left: LocalDraftRevision,
  right: LocalDraftRevision,
) {
  return left === right;
}
