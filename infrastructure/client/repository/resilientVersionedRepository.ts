// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryBackendMergeConflictError,
  VersionedRepositoryLocalConflictError,
  VersionedRepositoryRemoteError,
  type VersionedRepository,
  type VersionedRepositoryBackend,
  type VersionedContentConflictPreference,
  type VersionedContentMergePolicy,
  type VersionedContentPreparationPolicy,
  type VersionedRepositoryConflictProof,
  type VersionedRepositorySnapshot,
  type VersionedRepositorySnapshotTransition,
  type VersionedRepositorySyncResult,
} from "../../../application/persistence/versionedRepository";
import type { VersionedRepositoryCache } from "./versionedRepositoryCache";
import { LocalFirstRepositoryProjectionState } from "./resilientVersionedRepositoryProjection.ts";
import {
  LocalFirstRepositoryRemoteReconciliation,
} from "./resilientVersionedRepositoryRemoteReconciliation.ts";
import { LocalFirstRepositoryStaging } from "./resilientVersionedRepositoryStaging.ts";
import {
  canUseVersionedRepositoryCachedSnapshot,
  isRetryableVersionedRepositoryRemoteError,
  normalizeVersionedConflictUnitIds,
  versionedContentEqual,
  versionedRepositoryErrorMessage,
} from "./resilientVersionedRepositoryPolicy.ts";

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
  const projections = new LocalFirstRepositoryProjectionState<
    Content,
    Revision,
    LocalRevision,
    Projection
  >(preparation);
  const staging = new LocalFirstRepositoryStaging({
    cache,
    createLocalRevision,
    mergeContent,
    preparation,
    projections,
  });
  const remoteReconciliation = new LocalFirstRepositoryRemoteReconciliation({
    cache,
    createBusyError,
    createLocalRevision,
    mergeContent,
    preparation,
    projections,
  });
  const resolveIdentity = () => Promise.resolve(repositoryIdentity);

  const runExplicitLoad = async () => {
    const identity = await resolveIdentity();
    const local = await cache.load(identity);

    if (local) {
      const localPrepared = projections.prepareLocalState(local);
      if (loadPolicy.mode === "cache-first") {
        return projections.toSnapshot(local, localPrepared);
      }
      let remote;
      try {
        remote = await backend.loadRemoteSnapshot();
      } catch (error) {
        if (canUseVersionedRepositoryCachedSnapshot(error)) {
          const fallback = await cache.load(identity) ?? local;

          return projections.toSnapshot(
            fallback,
            projections.prepareLocalState(fallback),
          );
        }
        throw error;
      }
      const remotePrepared = remote.revision === local.remoteRevision
        ? {
            content: remote.content,
            projection: localPrepared.projection,
          }
        : projections.prepareRemote(
            remote.content,
            remote.revision,
            localPrepared.projection,
          );

      return remoteReconciliation.reconcileRemoteSnapshot(
        identity,
        remote,
        remotePrepared,
      );
    }

    const remote = await backend.loadRemoteSnapshot();
    const remotePrepared = projections.prepareRemote(
      remote.content,
      remote.revision,
    );
    try {
      const state = await cache.create({
        identity,
        localRevision: createLocalRevision(),
        snapshot: remote,
      });

      projections.rememberLocal(state, remotePrepared);
      projections.rememberRemote(remote.revision, remotePrepared);
      return projections.toSnapshot(state, remotePrepared);
    } catch (error) {
      const concurrentlyCreated = await cache.load(identity);
      if (!concurrentlyCreated) {
        throw error;
      }
      projections.clearLocal();
      return projections.toSnapshot(
        concurrentlyCreated,
        projections.prepareLocalState(concurrentlyCreated),
      );
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
        return complete(projections.toTransition(
          local.localRevision,
          local,
        ), {
          status: "synced",
        });
      }
      const localPrepared = projections.prepareLocalState(local);
      const syncContext = await cache.loadSyncContext(identity);
      const preparedBase = projections.readRemoteBase(
        local.pendingBaseRevision,
      );

      if (
        preparation.validateTransition &&
        syncContext?.baseContent &&
        !preparedBase
      ) {
        const basePrepared = projections.prepare(
          syncContext.baseContent,
          localPrepared.projection,
        );

        preparation.validateTransition(basePrepared, localPrepared);
        projections.rememberRemote(local.pendingBaseRevision, basePrepared);
      } else if (preparation.validateTransition && preparedBase) {
        preparation.validateTransition(preparedBase, localPrepared);
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
        const transition = await remoteReconciliation.installSynchronizedSnapshot(
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
          projections.clearRemoteBase();
          let remote;

          try {
            remote = await backend.loadRemoteSnapshot();
          } catch (loadError) {
            if (!isRetryableVersionedRepositoryRemoteError(loadError)) {
              throw loadError;
            }
            const current = await cache.load(identity);
            if (!current) throw loadError;
            return complete(projections.toTransition(
              current.localRevision,
              current,
              projections.prepareLocalState(
                current,
                localPrepared.projection,
              ),
            ), {
              message: versionedRepositoryErrorMessage(loadError),
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
              localRevision: createLocalRevision(),
              localContent: current.content,
              remoteContent: remote.content,
              unitIds: error.unitIds,
            });

            return complete(projections.toTransition(
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

          projections.clearRemoteBase();

          try {
            remote = await backend.loadRemoteSnapshot();
          } catch (loadError) {
            if (!isRetryableVersionedRepositoryRemoteError(loadError)) {
              throw loadError;
            }
            const current = await cache.load(identity);
            if (!current) throw loadError;

            return complete(projections.toTransition(
              current.localRevision,
              current,
              projections.prepareLocalState(
                current,
                localPrepared.projection,
              ),
            ), {
              message: versionedRepositoryErrorMessage(loadError),
              status: "sync-error",
            });
          }

          if (remote.revision !== conflictRevision) {
            if (attempt + 1 < 3) continue;
            throw createBusyError();
          }
          const remotePrepared = projections.prepareRemote(
            remote.content,
            remote.revision,
            localPrepared.projection,
          );
          let transition;
          try {
            transition = await remoteReconciliation.reconcilePendingSnapshot(
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
        const transition = projections.toTransition(
          current.localRevision,
          current,
          projections.prepareLocalState(
            current,
            localPrepared.projection,
          ),
        );
        if (isRetryableVersionedRepositoryRemoteError(error)) {
          return complete(transition, {
            status: "offline",
          });
        }
        return complete(transition, {
          message: versionedRepositoryErrorMessage(error),
          status: "sync-error",
        });
      }
    }
    throw createBusyError();
  };
  const loadConflictSnapshot = async () => {
    const identity = await resolveIdentity();

    await ensureInitialized();
    const [current, context] = await Promise.all([
      cache.load(identity),
      cache.loadSyncContext(identity),
    ]);

    if (!current) {
      throw new Error(
        "Local repository state disappeared while loading conflict details.",
      );
    }
    return context?.conflict
      ? {
          ...context.conflict,
          local: current.content,
          localRevision: current.localRevision,
        }
      : null;
  };
  const resolveConflictAndSynchronize = async (
    proof: VersionedRepositoryConflictProof<Revision, LocalRevision>,
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
    >[2],
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
    if (current.localRevision !== proof.localRevision) {
      throw new VersionedRepositoryLocalConflictError(current.localRevision);
    }
    if (
      current.remoteRevision !== proof.remoteRevision ||
      conflict.remoteRevision !== proof.remoteRevision
    ) {
      throw new Error("Repository conflict proof is no longer current.");
    }
    const currentPrepared = projections.prepareLocalState(current);
    const remotePrepared = projections.prepareRemote(
      conflict.remote,
      conflict.remoteRevision,
      currentPrepared.projection,
    );
    const basePrepared = mergeContent
      ? projections.prepareMergeBase(
        conflict.base,
        current,
        currentPrepared,
        versionedContentEqual,
      )
      : null;
    const unresolved = basePrepared && mergeContent
      ? mergeContent(basePrepared, currentPrepared, remotePrepared)
      : { status: "conflict" as const, unitIds: ["repository"] };
    const liveUnitIds = unresolved.status === "conflict"
      ? normalizeVersionedConflictUnitIds(unresolved.unitIds)
      : [];
    const merged = unresolved.status === "merged"
      ? unresolved
      : basePrepared && mergeContent
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
    const liveConflict = {
      ...conflict,
      local: current.content,
      unitIds: liveUnitIds,
    };
    const mergedPrepared = merged;
    const recovery = transform && liveUnitIds.length > 0
      ? transform(mergedPrepared, liveConflict, {
          local: currentPrepared,
          remote: remotePrepared,
        })
      : null;
    if (
      recovery &&
      JSON.stringify(
        normalizeVersionedConflictUnitIds(recovery.coveredUnitIds),
      ) !==
        JSON.stringify(liveUnitIds)
    ) {
      throw new Error(
        "Repository conflict recovery did not cover every discarded unit.",
      );
    }
    const contentPrepared = recovery?.prepared ?? mergedPrepared;
    const content = contentPrepared.content;

    preparation.validateTransition?.(remotePrepared, contentPrepared);
    const rebased = await cache.rebaseFromRemote({
      content,
      expectedLocalRevision: current.localRevision,
      identity,
      localRevision: createLocalRevision(),
      pendingChanges: !versionedContentEqual(content, conflict.remote),
      snapshot: {
        content: conflict.remote,
        revision: conflict.remoteRevision,
      },
    });
    projections.rememberLocal(rebased, contentPrepared);
    projections.rememberRemote(conflict.remoteRevision, remotePrepared);
    const resolvedTransition = projections.toTransition(
      current.localRevision,
      rebased,
      contentPrepared,
    );
    let synchronized: SyncResult;

    try {
      synchronized = await synchronize();
    } catch (error) {
      const latest = await cache.load(identity);

      if (!latest) throw error;
      const latestTransition = latest.localRevision === rebased.localRevision
        ? null
        : projections.toTransition(
            rebased.localRevision,
            latest,
            projections.prepareLocalState(
              latest,
              contentPrepared.projection,
            ),
          );
      const recoveryTransitions: SyncResult["transitions"] = latestTransition
        ? [resolvedTransition, latestTransition]
        : [resolvedTransition];

      return {
        message: versionedRepositoryErrorMessage(error),
        status: "sync-error" as const,
        transitions: recoveryTransitions,
      };
    }
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
      const remotePrepared = projections.prepareRemote(
        remote.content,
        remote.revision,
        projections.localProjection(),
      );
      const state = await cache.replaceFromRemote({
        expectedLocalRevision: current.localRevision,
        identity,
        localRevision: createLocalRevision(),
        snapshot: remote,
      });

      projections.rememberLocal(state, remotePrepared);
      projections.rememberRemote(remote.revision, remotePrepared);
      return projections.toSnapshot(state, remotePrepared);
    },
    loadSnapshot,
    loadConflict: loadConflictSnapshot,
    resolveConflictAndSynchronize: (proof, preference, transform) =>
      resolveConflictAndSynchronize(proof, preference, transform),
    async stageSnapshot(change) {
      await ensureInitialized();
      const identity = await resolveIdentity();
      return staging.stage(identity, change);
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
