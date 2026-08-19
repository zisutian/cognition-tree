// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryLocalConflictError,
  VersionedRepositoryRemoteError,
  VersionedRepositoryUnavailableError,
  type VersionedRepository,
  type VersionedRepositoryBackend,
  type VersionedContentConflictPreference,
  type VersionedContentMergePolicy,
  type VersionedRepositoryContentValidator,
  type VersionedRepositoryTransitionValidator,
  type VersionedRepositorySnapshot,
  type VersionedRepositorySyncResult,
} from "../../../application/persistence/versionedRepository";
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
  mergeContent?: VersionedContentMergePolicy<Content>;
  refreshRemoteOnLoad?: boolean;
  repositoryIdentity: string | Promise<string>;
  subscribeReconnect?: (listener: () => void) => () => void;
  validateContent: VersionedRepositoryContentValidator<Content>;
  validateTransition?: VersionedRepositoryTransitionValidator<Content>;
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
  mergeContent,
  refreshRemoteOnLoad = false,
  repositoryIdentity,
  subscribeReconnect = () => () => undefined,
  validateContent,
  validateTransition,
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

  const contentEqual = (left: Content, right: Content) =>
    JSON.stringify(left) === JSON.stringify(right);

  const reconcilePendingRemoteSnapshot = async (
    identity: string,
    current: NonNullable<Awaited<ReturnType<typeof cache.load>>>,
    remote: Awaited<ReturnType<typeof backend.loadRemoteSnapshot>>,
  ) => {
    const syncContext = await cache.loadSyncContext(identity);
    const baseContent = syncContext?.baseContent;
    const merged = baseContent && mergeContent
      ? mergeContent(baseContent, current.content, remote.content)
      : {
          status: "conflict" as const,
          unitIds: ["repository"],
        };

    if (merged.status === "conflict") {
      return cache.recordConflict({
        baseContent: baseContent ?? current.content,
        currentRemoteRevision: remote.revision,
        identity,
        localContent: current.content,
        remoteContent: remote.content,
        unitIds: merged.unitIds,
      });
    }
    validateContent(merged.content);
    validateTransition?.(remote.content, merged.content);
    return cache.rebaseFromRemote({
      content: merged.content,
      expectedLocalRevision: current.localRevision,
      identity,
      localRevision: createLocalRevision(),
      pendingChanges: !contentEqual(merged.content, remote.content),
      snapshot: remote,
    });
  };

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
        if (current.remoteRevision === remote.revision) {
          return toSnapshot(current);
        }
        try {
          return toSnapshot(await reconcilePendingRemoteSnapshot(
            identity,
            current,
            remote,
          ));
        } catch (error) {
          if (!(error instanceof VersionedRepositoryLocalConflictError)) {
            throw error;
          }
          continue;
        }
      }
      if (current.remoteRevision === remote.revision) {
        return toSnapshot(current);
      }
      try {
        validateTransition?.(current.content, remote.content);
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
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
          committedContent: local.content,
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
          const conflictRevision = error.currentRevision as Revision;
          let remote;

          try {
            remote = await backend.loadRemoteSnapshot();
          } catch (loadError) {
            if (!isRetryableRemoteError(loadError)) throw loadError;
            const current = await cache.recordConflictRevision({
              currentRemoteRevision: conflictRevision,
              identity,
            });

            return {
              localRevision: current.localRevision,
              remoteRevision: conflictRevision,
              status: "conflict",
            };
          }

          validateContent(remote.content);
          if (remote.revision !== conflictRevision) {
            const current = await cache.recordConflictRevision({
              currentRemoteRevision: conflictRevision,
              identity,
            });

            return {
              localRevision: current.localRevision,
              remoteRevision: conflictRevision,
              status: "conflict",
            };
          }
          let current;
          try {
            current = await reconcilePendingRemoteSnapshot(
              identity,
              local,
              remote,
            );
          } catch (rebaseError) {
            if (
              rebaseError instanceof VersionedRepositoryLocalConflictError &&
              attempt + 1 < 3
            ) {
              continue;
            }
            throw rebaseError;
          }
          if (
            current.pendingBaseRevision !== null &&
            current.remoteRevision !== null &&
            current.pendingBaseRevision !== current.remoteRevision
          ) {
            return {
              localRevision: current.localRevision,
              remoteRevision: remote.revision,
              status: "conflict",
            };
          }
          continue;
        }
        const current = await cache.load(identity);
        if (!current) throw error;
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
    }
    throw createBusyError();
  };
  const resolveConflictAndSynchronize = async (
    preference: VersionedContentConflictPreference,
    transform?: Parameters<
      NonNullable<
        VersionedRepository<
          Content,
          Revision,
          LocalRevision,
          Location
        >["resolveConflictAndSynchronize"]
      >
    >[1],
  ) => {
    const identity = await resolveIdentity();

    await ensureInitialized();
    const [current, context] = await Promise.all([
      cache.load(identity),
      cache.loadSyncContext(identity),
    ]);
    const conflict = context?.conflict;

    if (!current || !conflict) {
      throw new Error("Repository does not have a persisted conflict.");
    }
    validateContent(current.content);
    validateContent(conflict.remote);
    const merged = mergeContent
      ? mergeContent(
          conflict.base,
          current.content,
          conflict.remote,
          preference,
        )
      : {
          content: preference === "local"
            ? current.content
            : conflict.remote,
          status: "merged" as const,
        };

    if (merged.status !== "merged") {
      throw new Error("Repository conflict could not be resolved.");
    }
    const liveConflict = { ...conflict, local: current.content };
    const content = transform
      ? transform(merged.content, liveConflict)
      : merged.content;

    validateContent(content);
    validateTransition?.(conflict.remote, content);
    await cache.rebaseFromRemote({
      content,
      expectedLocalRevision: current.localRevision,
      identity,
      localRevision: createLocalRevision(),
      pendingChanges: !contentEqual(content, conflict.remote),
      snapshot: {
        content: conflict.remote,
        revision: conflict.remoteRevision,
      },
    });
    return synchronize();
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
    async loadConflict() {
      const identity = await resolveIdentity();

      await ensureInitialized();
      const [current, context] = await Promise.all([
        cache.load(identity),
        cache.loadSyncContext(identity),
      ]);

      return current && context?.conflict
        ? { ...context.conflict, local: current.content }
        : null;
    },
    keepLocalConflictAndSynchronize: () =>
      resolveConflictAndSynchronize("local"),
    resolveConflictAndSynchronize,
    async stageSnapshot({ content, expectedLocalRevision }) {
      validateContent(content);
      await ensureInitialized();
      const identity = await resolveIdentity();
      const current = await cache.load(identity);

      if (!current) {
        throw new Error(
          "Local repository state disappeared before staging.",
        );
      }
      validateContent(current.content);
      validateTransition?.(current.content, content);
      const state = await cache.stage({
        content,
        expectedLocalRevision,
        identity,
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
