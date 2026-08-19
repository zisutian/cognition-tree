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
  type PreparedVersionedContent,
  type VersionedContentPreparationPolicy,
  type VersionedRepositorySnapshot,
  type VersionedRepositorySyncResult,
} from "../../../application/persistence/versionedRepository";
import type { VersionedRepositoryCache } from "./versionedRepositoryCache";

type LocalFirstVersionedRepositoryOptions<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Location,
  Projection,
> = {
  backend: VersionedRepositoryBackend<Content, Revision>;
  cache: VersionedRepositoryCache<Content, Revision, LocalRevision>;
  createBusyError?: () => Error;
  createLocalRevision: () => LocalRevision;
  label: string;
  location: Location;
  mergeContent?: VersionedContentMergePolicy<
    Content,
    Projection
  >;
  refreshRemoteOnLoad?: boolean;
  repositoryIdentity: string | Promise<string>;
  subscribeReconnect?: (listener: () => void) => () => void;
  preparation: VersionedContentPreparationPolicy<Content, Projection>;
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
  Projection,
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
  preparation,
}: LocalFirstVersionedRepositoryOptions<
  Content,
  Revision,
  LocalRevision,
  Location,
  Projection
>): VersionedRepository<Content, Revision, LocalRevision, Location, Projection> {
  type Prepared = PreparedVersionedContent<Content, Projection>;
  type Snapshot = VersionedRepositorySnapshot<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;
  type SyncResult = VersionedRepositorySyncResult<Revision, LocalRevision>;
  let activeLoad: Promise<Snapshot> | null = null;
  let activeSync: Promise<SyncResult> | null = null;
  let initialized = false;
  let preparedLocal: {
    localRevision: LocalRevision;
    projection: Projection;
  } | null = null;
  let preparedRemoteBase: {
    revision: Revision;
    value: Prepared;
  } | null = null;
  const resolveIdentity = () => Promise.resolve(repositoryIdentity);
  const prepare = (
    content: Content,
    previous?: Projection | null,
  ): Prepared => ({
    content,
    projection: preparation.prepare(content, previous),
  });
  const prepareRemoteContent = (
    content: Content,
    revision: Revision,
    previous?: Projection | null,
  ): Prepared => {
    if (preparedRemoteBase?.revision === revision) {
      return {
        content,
        projection: preparedRemoteBase.value.projection,
      };
    }
    const value = prepare(content, previous);

    preparedRemoteBase = { revision, value };
    return value;
  };
  const prepareState = (
    state: NonNullable<Awaited<ReturnType<typeof cache.load>>>,
    previous?: Projection | null,
  ) => {
    if (preparedLocal?.localRevision === state.localRevision) {
      return {
        content: state.content,
        projection: preparedLocal.projection,
      };
    }
    const value = prepare(
      state.content,
      previous ?? preparedLocal?.projection,
    );

    preparedLocal = {
      localRevision: state.localRevision,
      projection: value.projection,
    };
    return value;
  };
  const rememberPrepared = (
    state: NonNullable<Awaited<ReturnType<typeof cache.load>>>,
    value: Prepared,
  ) => {
    preparedLocal = {
      localRevision: state.localRevision,
      projection: value.projection,
    };
    return { content: state.content, projection: value.projection };
  };
  const toSnapshot = (
    state: NonNullable<Awaited<ReturnType<typeof cache.load>>>,
    prepared = prepareState(state),
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
    projection: prepared.projection,
    remoteRevision: state.remoteRevision,
  });

  const contentEqual = (left: Content, right: Content) =>
    JSON.stringify(left) === JSON.stringify(right);
  const prepareMergeBase = (
    content: Content,
    current: NonNullable<Awaited<ReturnType<typeof cache.load>>>,
    currentPrepared: Prepared,
  ) =>
    current.pendingBaseRevision !== null &&
      preparedRemoteBase?.revision === current.pendingBaseRevision &&
      contentEqual(preparedRemoteBase.value.content, content)
      ? preparedRemoteBase.value
      : prepare(content, currentPrepared.projection);

  const reconcilePendingRemoteSnapshot = async (
    identity: string,
    current: NonNullable<Awaited<ReturnType<typeof cache.load>>>,
    currentPrepared: Prepared,
    remote: Awaited<ReturnType<typeof backend.loadRemoteSnapshot>>,
    remotePrepared: Prepared,
  ) => {
    const syncContext = await cache.loadSyncContext(identity);
    const baseContent = syncContext?.baseContent;
    const basePrepared = baseContent && mergeContent
      ? prepareMergeBase(baseContent, current, currentPrepared)
      : null;
    const merged = basePrepared && mergeContent
      ? mergeContent(basePrepared, currentPrepared, remotePrepared)
      : {
          status: "conflict" as const,
          unitIds: ["repository"],
        };

    if (merged.status === "conflict") {
      const state = await cache.recordConflict({
        baseContent: baseContent ?? current.content,
        currentRemoteRevision: remote.revision,
        identity,
        localContent: current.content,
        remoteContent: remote.content,
        unitIds: merged.unitIds,
      });
      rememberPrepared(state, currentPrepared);
      preparedRemoteBase = {
        revision: remote.revision,
        value: remotePrepared,
      };
      return toSnapshot(state, currentPrepared);
    }
    const mergedPrepared = merged;

    preparation.validateTransition?.(remotePrepared, mergedPrepared);
    const state = await cache.rebaseFromRemote({
      content: merged.content,
      expectedLocalRevision: current.localRevision,
      identity,
      localRevision: createLocalRevision(),
      pendingChanges: !contentEqual(merged.content, remote.content),
      snapshot: remote,
    });
    rememberPrepared(state, mergedPrepared);
    preparedRemoteBase = {
      revision: remote.revision,
      value: remotePrepared,
    };
    return toSnapshot(state, mergedPrepared);
  };

  const reconcileRemoteSnapshot = async (
    identity: string,
    remote: Awaited<ReturnType<typeof backend.loadRemoteSnapshot>>,
    remotePrepared: Prepared,
  ) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await cache.load(identity);

      if (!current) {
        throw new Error(
          "Local repository state disappeared during remote refresh.",
        );
      }
      const currentPrepared = prepareState(current);
      if (current.pendingBaseRevision) {
        if (current.remoteRevision === remote.revision) {
          return toSnapshot(current, currentPrepared);
        }
        try {
          return await reconcilePendingRemoteSnapshot(
            identity,
            current,
            currentPrepared,
            remote,
            remotePrepared,
          );
        } catch (error) {
          if (!(error instanceof VersionedRepositoryLocalConflictError)) {
            throw error;
          }
          continue;
        }
      }
      if (current.remoteRevision === remote.revision) {
        preparedRemoteBase = {
          revision: remote.revision,
          value: remotePrepared,
        };
        return toSnapshot(current, currentPrepared);
      }
      try {
        preparation.validateTransition?.(currentPrepared, remotePrepared);
        const state = await cache.replaceFromRemote({
          expectedLocalRevision: current.localRevision,
          identity,
          localRevision: createLocalRevision(),
          snapshot: remote,
        });

        rememberPrepared(state, remotePrepared);
        preparedRemoteBase = {
          revision: remote.revision,
          value: remotePrepared,
        };
        return toSnapshot(state, remotePrepared);
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
      const localPrepared = prepareState(local);
      if (!refreshRemoteOnLoad) {
        return toSnapshot(local, localPrepared);
      }
      let remote;
      try {
        remote = await backend.loadRemoteSnapshot();
      } catch (error) {
        if (canUseCachedSnapshot(error)) {
          const fallback = await cache.load(identity) ?? local;

          return toSnapshot(fallback, prepareState(fallback));
        }
        throw error;
      }
      const remotePrepared = remote.revision === local.remoteRevision
        ? {
            content: remote.content,
            projection: localPrepared.projection,
          }
        : prepareRemoteContent(
            remote.content,
            remote.revision,
            localPrepared.projection,
          );

      return reconcileRemoteSnapshot(identity, remote, remotePrepared);
    }

    const remote = await backend.loadRemoteSnapshot();
    const remotePrepared = prepareRemoteContent(
      remote.content,
      remote.revision,
    );
    try {
      const state = await cache.create({
        identity,
        localRevision: createLocalRevision(),
        snapshot: remote,
      });

      rememberPrepared(state, remotePrepared);
      preparedRemoteBase = {
        revision: remote.revision,
        value: remotePrepared,
      };
      return toSnapshot(state, remotePrepared);
    } catch (error) {
      const concurrentlyCreated = await cache.load(identity);
      if (!concurrentlyCreated) {
        throw error;
      }
      preparedLocal = null;
      return toSnapshot(concurrentlyCreated, prepareState(concurrentlyCreated));
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
      const localPrepared = prepareState(local);
      const syncContext = await cache.loadSyncContext(identity);

      if (
        preparation.validateTransition &&
        syncContext?.baseContent &&
        preparedRemoteBase?.revision !== local.pendingBaseRevision
      ) {
        const basePrepared = prepare(
          syncContext.baseContent,
          localPrepared.projection,
        );

        preparation.validateTransition(basePrepared, localPrepared);
        preparedRemoteBase = {
          revision: local.pendingBaseRevision,
          value: basePrepared,
        };
      } else if (
        preparation.validateTransition &&
        preparedRemoteBase?.revision === local.pendingBaseRevision
      ) {
        preparation.validateTransition(preparedRemoteBase.value, localPrepared);
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
        if (current.localRevision === local.localRevision) {
          rememberPrepared(current, localPrepared);
        } else {
          prepareState(current, localPrepared.projection);
        }
        preparedRemoteBase = {
          revision: committed.revision,
          value: localPrepared,
        };
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

          preparedRemoteBase = null;

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
          const remotePrepared = prepareRemoteContent(
            remote.content,
            remote.revision,
            localPrepared.projection,
          );
          let current;
          try {
            current = await reconcilePendingRemoteSnapshot(
              identity,
              local,
              localPrepared,
              remote,
              remotePrepared,
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
            current.conflictRevision !== null
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
          Location,
          Projection
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
    const currentPrepared = prepareState(current);
    const remotePrepared = prepareRemoteContent(
      conflict.remote,
      conflict.remoteRevision,
      currentPrepared.projection,
    );
    const basePrepared = mergeContent
      ? prepareMergeBase(conflict.base, current, currentPrepared)
      : null;
    const merged = basePrepared && mergeContent
      ? mergeContent(
          basePrepared,
          currentPrepared,
          remotePrepared,
          preference,
        )
      : {
          ...(preference === "local" ? currentPrepared : remotePrepared),
          status: "merged" as const,
        };

    if (merged.status !== "merged") {
      throw new Error("Repository conflict could not be resolved.");
    }
    const liveConflict = { ...conflict, local: current.content };
    const mergedPrepared = merged;
    const contentPrepared = transform
      ? transform(mergedPrepared, liveConflict, {
          local: currentPrepared,
          remote: remotePrepared,
        })
      : mergedPrepared;
    const content = contentPrepared.content;

    preparation.validateTransition?.(remotePrepared, contentPrepared);
    const rebased = await cache.rebaseFromRemote({
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
    rememberPrepared(rebased, contentPrepared);
    preparedRemoteBase = {
      revision: conflict.remoteRevision,
      value: remotePrepared,
    };
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
      const remotePrepared = prepareRemoteContent(
        remote.content,
        remote.revision,
        preparedLocal?.projection,
      );
      const state = await cache.replaceFromRemote({
        expectedLocalRevision: current.localRevision,
        identity,
        localRevision: createLocalRevision(),
        snapshot: remote,
      });

      rememberPrepared(state, remotePrepared);
      preparedRemoteBase = {
        revision: remote.revision,
        value: remotePrepared,
      };
      return toSnapshot(state, remotePrepared);
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
    resolveConflictAndSynchronize: (preference, transform) =>
      resolveConflictAndSynchronize(preference, transform),
    async stageSnapshot({ content, expectedLocalRevision, projection }) {
      await ensureInitialized();
      const identity = await resolveIdentity();
      const current = await cache.load(identity);

      if (!current) {
        throw new Error(
          "Local repository state disappeared before staging.",
        );
      }
      const currentPrepared = prepareState(current);
      const nextPrepared = { content, projection };

      preparation.validateTransition?.(currentPrepared, nextPrepared);
      if (!current.pendingBaseRevision && current.remoteRevision) {
        preparedRemoteBase = {
          revision: current.remoteRevision,
          value: currentPrepared,
        };
      }
      const state = await cache.stage({
        content,
        expectedLocalRevision,
        identity,
        localRevision: createLocalRevision(),
      });
      rememberPrepared(state, nextPrepared);
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
