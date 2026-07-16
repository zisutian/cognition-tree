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
  WorkspaceRepositoryRemoteError,
  WorkspaceRepositoryUnavailableError,
} from "./workspaceRepository";

type LocalFirstWorkspaceRepositoryOptions = {
  backend: WorkspaceRepositoryBackend;
  cache: WorkspaceRepositoryCache;
  createDraftId: () => string;
  label: string;
  locationLabel: string;
  repositoryIdentity: string | Promise<string>;
  subscribeReconnect?: (listener: () => void) => () => void;
  validateContent: WorkspaceRepositoryContentValidator;
};

function toSnapshot(
  state: Awaited<ReturnType<WorkspaceRepositoryCache["load"]>> & {},
): WorkspaceRepositorySnapshot {
  return {
    content: state.content,
    localRevision: state.localRevision,
    pendingChanges: state.pendingBaseRevision !== null,
    remoteRevision: state.remoteRevision,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Repository synchronization failed";
}

function isOfflineError(error: unknown) {
  return (
    error instanceof WorkspaceRepositoryUnavailableError ||
    (error instanceof WorkspaceRepositoryRemoteError && error.retryable)
  );
}

export function createLocalFirstWorkspaceRepository({
  backend,
  cache,
  createDraftId,
  label,
  locationLabel,
  repositoryIdentity,
  subscribeReconnect = () => () => undefined,
  validateContent,
}: LocalFirstWorkspaceRepositoryOptions): WorkspaceRepository {
  let initialLoad: Promise<WorkspaceRepositorySnapshot> | null = null;
  let activeSync: Promise<WorkspaceRepositorySyncResult> | null = null;
  const resolveIdentity = () => Promise.resolve(repositoryIdentity);
  const nextLocalRevision = () => createLocalDraftRevision(createDraftId);

  const loadSnapshot = async () => {
    const identity = await resolveIdentity();
    const local = await cache.load(identity);

    if (local) {
      validateContent(local.content);
      return toSnapshot(local);
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

  const ensureLoaded = () => {
    initialLoad ??= loadSnapshot().finally(() => {
      initialLoad = null;
    });
    return initialLoad;
  };

  const synchronize = async (): Promise<WorkspaceRepositorySyncResult> => {
    const identity = await resolveIdentity();
    await ensureLoaded();
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

      if (isOfflineError(error)) {
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
    locationLabel,
    async discardPendingSnapshotAndReload() {
      const identity = await resolveIdentity();
      await ensureLoaded();
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
    loadSnapshot: ensureLoaded,
    async stageSnapshot({ content, expectedLocalRevision }) {
      validateContent(content);
      await ensureLoaded();
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
