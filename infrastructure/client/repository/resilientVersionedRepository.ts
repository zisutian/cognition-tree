// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryBackendMergeConflictError,
  VersionedRepositoryLocalConflictError,
  VersionedRepositoryLocalMergeConflictError,
  VersionedRepositoryRemoteError,
  VersionedRepositoryUnavailableError,
  type VersionedRepository,
  type VersionedRepositoryBackend,
  type VersionedContentConflictPreference,
  type VersionedContentMergePolicy,
  type PreparedVersionedContent,
  type PreparedVersionedContentChange,
  type VersionedContentPreparationPolicy,
  type VersionedRepositorySnapshot,
  type VersionedRepositorySnapshotTransition,
  type VersionedRepositorySyncResult,
} from "../../../application/persistence/versionedRepository";
import type { VersionedRepositoryCache } from "./versionedRepositoryCache";

export type VersionedRepositoryLoadPolicy =
  | Readonly<{ mode: "cache-first" }>
  | Readonly<{ mode: "refresh-remote" }>;

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
  loadPolicy: VersionedRepositoryLoadPolicy;
  location: Location;
  mergeContent?: VersionedContentMergePolicy<
    Content,
    Projection
  >;
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
  loadPolicy,
  location,
  mergeContent,
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
  type SnapshotTransition = VersionedRepositorySnapshotTransition<
    Content,
    Projection,
    Revision,
    LocalRevision
  >;
  type SyncResult = VersionedRepositorySyncResult<
    Content,
    Projection,
    Revision,
    LocalRevision
  >;
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
  const toSnapshotTransition = (
    previousLocalRevision: LocalRevision,
    state: NonNullable<Awaited<ReturnType<typeof cache.load>>>,
    prepared = prepareState(state),
  ): SnapshotTransition => ({
    previousLocalRevision,
    snapshot: toSnapshot(state, prepared),
  });

  const contentEqual = (left: Content, right: Content) =>
    JSON.stringify(left) === JSON.stringify(right);
  const continuePreparedChange = (
    change: PreparedVersionedContentChange<
      Content,
      Projection,
      LocalRevision
    >,
    currentLocalRevision: LocalRevision,
    current: Prepared,
  ): Prepared => {
    if (change.baseLocalRevision === currentLocalRevision) {
      if (!contentEqual(change.before.content, current.content)) {
        throw new VersionedRepositoryLocalMergeConflictError(["repository"]);
      }
      return change.after;
    }
    const merged = mergeContent
      ? mergeContent(change.before, change.after, current)
      : { status: "conflict" as const, unitIds: ["repository"] };

    if (merged.status === "conflict") {
      throw new VersionedRepositoryLocalMergeConflictError(merged.unitIds);
    }
    return merged;
  };
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
        expectedLocalRevision: current.localRevision,
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
      return toSnapshotTransition(
        current.localRevision,
        state,
        currentPrepared,
      );
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
    return toSnapshotTransition(
      current.localRevision,
      state,
      mergedPrepared,
    );
  };

  const installSynchronizedSnapshot = async (
    identity: string,
    submitted: NonNullable<Awaited<ReturnType<typeof cache.load>>>,
    submittedPrepared: Prepared,
    remote: Awaited<ReturnType<
      typeof backend.synchronizeRemoteSnapshot
    >>["snapshot"],
  ) => {
    const remotePrepared = prepareRemoteContent(
      remote.content,
      remote.revision,
      submittedPrepared.projection,
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await cache.load(identity);

      if (!current) {
        throw new Error(
          "Local repository state disappeared during synchronization.",
        );
      }
      const currentPrepared = current.localRevision === submitted.localRevision
        ? submittedPrepared
        : prepareState(current, submittedPrepared.projection);
      const merged = current.localRevision === submitted.localRevision
        ? { ...remotePrepared, status: "merged" as const }
        : mergeContent
          ? mergeContent(submittedPrepared, currentPrepared, remotePrepared)
          : { status: "conflict" as const, unitIds: ["repository"] };

      try {
        if (merged.status === "conflict") {
          const conflicted = await cache.recordConflict({
            baseContent: submitted.content,
            currentRemoteRevision: remote.revision,
            expectedLocalRevision: current.localRevision,
            identity,
            localContent: current.content,
            remoteContent: remote.content,
            unitIds: merged.unitIds,
          });

          rememberPrepared(conflicted, currentPrepared);
          preparedRemoteBase = { revision: remote.revision, value: remotePrepared };
          return toSnapshotTransition(
            current.localRevision,
            conflicted,
            currentPrepared,
          );
        }
        preparation.validateTransition?.(remotePrepared, merged);
        const rebased = await cache.rebaseFromRemote({
          content: merged.content,
          expectedLocalRevision: current.localRevision,
          identity,
          localRevision: current.localRevision === submitted.localRevision &&
              contentEqual(merged.content, submitted.content)
            ? current.localRevision
            : createLocalRevision(),
          pendingChanges: !contentEqual(merged.content, remote.content),
          snapshot: remote,
        });

        rememberPrepared(rebased, merged);
        preparedRemoteBase = { revision: remote.revision, value: remotePrepared };
        return toSnapshotTransition(
          current.localRevision,
          rebased,
          merged,
        );
      } catch (error) {
        if (
          error instanceof VersionedRepositoryLocalConflictError &&
          attempt + 1 < 3
        ) {
          continue;
        }
        throw error;
      }
    }
    throw createBusyError();
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
          return (await reconcilePendingRemoteSnapshot(
            identity,
            current,
            currentPrepared,
            remote,
            remotePrepared,
          )).snapshot;
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
      if (loadPolicy.mode === "cache-first") {
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
    const transitions: SnapshotTransition[] = [];
    const complete = (
      transition: SnapshotTransition,
      result:
        | { status: "conflict" | "offline" | "synced" }
        | { message: string; status: "sync-error" },
    ): SyncResult => {
      const completedTransitions: SyncResult["transitions"] =
        transitions.length === 0
          ? [transition]
          : [transitions[0]!, ...transitions.slice(1), transition];

      switch (result.status) {
        case "conflict":
          return { status: "conflict", transitions: completedTransitions };
        case "offline":
          return { status: "offline", transitions: completedTransitions };
        case "synced":
          return { status: "synced", transitions: completedTransitions };
        case "sync-error":
          return {
            message: result.message,
            status: "sync-error",
            transitions: completedTransitions,
          };
      }
    };

    await ensureInitialized();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const local = await cache.load(identity);

      if (!local) {
        throw new Error(
          "Local repository state disappeared during synchronization.",
        );
      }
      if (!local.pendingBaseRevision) {
        return complete(toSnapshotTransition(
          local.localRevision,
          local,
        ), {
          status: "synced",
        });
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
        if (!syncContext?.baseContent) {
          throw new Error("Repository synchronization base is unavailable.");
        }
        const synchronized = await backend.synchronizeRemoteSnapshot({
          base: {
            content: syncContext.baseContent,
            revision: local.pendingBaseRevision,
          },
          content: local.content,
        });
        const transition = await installSynchronizedSnapshot(
          identity,
          local,
          localPrepared,
          synchronized.snapshot,
        );
        if (transition.snapshot.conflictRevision !== null) {
          return complete(transition, {
            status: "conflict",
          });
        }
        return complete(transition, {
          status: "synced",
        });
      } catch (error) {
        if (error instanceof VersionedRepositoryBackendMergeConflictError) {
          preparedRemoteBase = null;
          let remote;

          try {
            remote = await backend.loadRemoteSnapshot();
          } catch (loadError) {
            if (!isRetryableRemoteError(loadError)) throw loadError;
            const current = await cache.load(identity);
            if (!current) throw loadError;
            return complete(toSnapshotTransition(
              current.localRevision,
              current,
              prepareState(current, localPrepared.projection),
            ), {
              message: getErrorMessage(loadError),
              status: "sync-error",
            });
          }
          if (remote.revision !== error.currentRevision) {
            if (attempt + 1 < 3) continue;
            throw createBusyError();
          }
          const current = await cache.load(identity);

          if (!current || !syncContext?.baseContent) {
            throw new Error(
              "Local repository state disappeared during conflict recovery.",
            );
          }
          if (current.localRevision !== local.localRevision) {
            if (attempt + 1 < 3) continue;
            throw createBusyError();
          }
          try {
            const conflicted = await cache.recordConflict({
              baseContent: syncContext.baseContent,
              currentRemoteRevision: remote.revision,
              expectedLocalRevision: current.localRevision,
              identity,
              localContent: current.content,
              remoteContent: remote.content,
              unitIds: error.unitIds,
            });

            return complete(toSnapshotTransition(
              current.localRevision,
              conflicted,
              localPrepared,
            ), {
              status: "conflict",
            });
          } catch (recordError) {
            if (
              recordError instanceof VersionedRepositoryLocalConflictError &&
              attempt + 1 < 3
            ) {
              continue;
            }
            throw recordError;
          }
        }
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

            return complete(toSnapshotTransition(
              current.localRevision,
              current,
              prepareState(current, localPrepared.projection),
            ), {
              status: "conflict",
            });
          }

          if (remote.revision !== conflictRevision) {
            const current = await cache.recordConflictRevision({
              currentRemoteRevision: conflictRevision,
              identity,
            });

            return complete(toSnapshotTransition(
              current.localRevision,
              current,
              prepareState(current, localPrepared.projection),
            ), {
              status: "conflict",
            });
          }
          const remotePrepared = prepareRemoteContent(
            remote.content,
            remote.revision,
            localPrepared.projection,
          );
          let transition;
          try {
            transition = await reconcilePendingRemoteSnapshot(
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
            transition.snapshot.conflictRevision !== null
          ) {
            return complete(transition, {
              status: "conflict",
            });
          }
          transitions.push(transition);
          continue;
        }
        const current = await cache.load(identity);
        if (!current) throw error;
        const transition = toSnapshotTransition(
          current.localRevision,
          current,
          prepareState(current, localPrepared.projection),
        );
        if (isRetryableRemoteError(error)) {
          return complete(transition, {
            status: "offline",
          });
        }
        return complete(transition, {
          message: getErrorMessage(error),
          status: "sync-error",
        });
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
    const resolvedTransition = toSnapshotTransition(
      current.localRevision,
      rebased,
      contentPrepared,
    );
    const synchronized = await synchronize();
    const transitions: SyncResult["transitions"] = [
      resolvedTransition,
      ...synchronized.transitions,
    ];

    return {
      ...synchronized,
      transitions,
    };
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
    async stageSnapshot(change) {
      await ensureInitialized();
      const identity = await resolveIdentity();
      let latestConflict: VersionedRepositoryLocalConflictError<LocalRevision>
        | null = null;

      preparation.validateTransition?.(change.before, change.after);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await cache.load(identity);

        if (!current) {
          throw new Error(
            "Local repository state disappeared before staging.",
          );
        }
        const currentPrepared = prepareState(
          current,
          change.before.projection,
        );
        const nextPrepared = continuePreparedChange(
          change,
          current.localRevision,
          currentPrepared,
        );

        preparation.validateTransition?.(currentPrepared, nextPrepared);
        if (!current.pendingBaseRevision && current.remoteRevision) {
          preparedRemoteBase = {
            revision: current.remoteRevision,
            value: currentPrepared,
          };
        }
        try {
          const state = await cache.stage({
            content: nextPrepared.content,
            expectedLocalRevision: current.localRevision,
            identity,
            localRevision: createLocalRevision(),
          });

          rememberPrepared(state, nextPrepared);
          return toSnapshotTransition(
            current.localRevision,
            state,
            nextPrepared,
          );
        } catch (error) {
          if (!(error instanceof VersionedRepositoryLocalConflictError)) {
            throw error;
          }
          latestConflict = error;
        }
      }
      throw latestConflict ?? new Error(
        "Local repository state kept changing during staging.",
      );
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
