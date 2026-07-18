// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryLocalConflictError,
  VersionedRepositoryRemoteError,
  VersionedRepositoryUnavailableError,
  type VersionedRepository,
  type VersionedRepositoryBackend,
  type VersionedRepositoryContentValidator,
  type VersionedRepositorySnapshot,
  type VersionedRepositorySyncResult,
} from "./versionedRepository";
import type { VersionedRepositoryCache } from "./versionedRepositoryCache";

type LocalFirstVersionedRepositoryOptions<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Location,
> = {
  backend: VersionedRepositoryBackend<Content, Revision>;
  cache: VersionedRepositoryCache<Content, Revision, LocalRevision>;
  createBusyError?: () => Error;
  createLocalRevision: () => LocalRevision;
  label: string;
  location: Location;
  refreshRemoteOnLoad?: boolean;
  repositoryIdentity: string | Promise<string>;
  subscribeReconnect?: (listener: () => void) => () => void;
  validateContent: VersionedRepositoryContentValidator<Content>;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Repository synchronization failed";
}

function isRetryableRemoteError(error: unknown) {
  return error instanceof VersionedRepositoryUnavailableError ||
    (error instanceof VersionedRepositoryRemoteError && error.retryable);
}

function canUseCachedSnapshot(error: unknown) {
  return isRetryableRemoteError(error) &&
    !(error instanceof VersionedRepositoryRemoteError &&
      error.code === "repository_busy");
}

export function createLocalFirstVersionedRepository<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Location,
>({
  backend,
  cache,
  createBusyError = () => new VersionedRepositoryRemoteError(
    "Local repository state kept changing during remote refresh.",
    { code: "repository_busy", retryable: true },
  ),
  createLocalRevision,
  label,
  location,
  refreshRemoteOnLoad = false,
  repositoryIdentity,
  subscribeReconnect = () => () => undefined,
  validateContent,
}: LocalFirstVersionedRepositoryOptions<
  Content,
  Revision,
  LocalRevision,
  Location
>): VersionedRepository<Content, Revision, LocalRevision, Location> {
  type Snapshot = VersionedRepositorySnapshot<Content, Revision, LocalRevision>;
  type SyncResult = VersionedRepositorySyncResult<Revision, LocalRevision>;
  let activeLoad: Promise<Snapshot> | null = null;
  let activeSync: Promise<SyncResult> | null = null;
  let initialized = false;
  const resolveIdentity = () => Promise.resolve(repositoryIdentity);
  const toSnapshot = (
    state: NonNullable<Awaited<ReturnType<typeof cache.load>>>,
  ): Snapshot => ({
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
  });

  const reconcileRemoteSnapshot = async (
    identity: string,
    remote: Awaited<ReturnType<typeof backend.loadRemoteSnapshot>>,
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
        return toSnapshot(await cache.replaceFromRemote({
          expectedLocalRevision: current.localRevision,
          identity,
          localRevision: createLocalRevision(),
          snapshot: remote,
        }));
      } catch (error) {
        if (!(error instanceof VersionedRepositoryLocalConflictError)) {
          throw error;
        }
      }
    }
    throw createBusyError();
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
      return toSnapshot(await cache.create({
        identity,
        localRevision: createLocalRevision(),
        snapshot: remote,
      }));
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
  const synchronize = async (): Promise<SyncResult> => {
    const identity = await resolveIdentity();
    await ensureInitialized();
    const local = await cache.load(identity);

    if (!local) {
      throw new Error(
        "Local repository state disappeared during synchronization.",
      );
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
      if (error instanceof VersionedRepositoryBackendConflictError) {
        const revision = error.currentRevision as Revision;
        const current = await cache.recordConflict({
          currentRemoteRevision: revision,
          identity,
        });
        return {
          localRevision: current.localRevision,
          remoteRevision: revision,
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
      return toSnapshot(await cache.replaceFromRemote({
        expectedLocalRevision: current.localRevision,
        identity,
        localRevision: createLocalRevision(),
        snapshot: remote,
      }));
    },
    loadSnapshot,
    async stageSnapshot({ content, expectedLocalRevision }) {
      validateContent(content);
      await ensureInitialized();
      const state = await cache.stage({
        content,
        expectedLocalRevision,
        identity: await resolveIdentity(),
        localRevision: createLocalRevision(),
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
