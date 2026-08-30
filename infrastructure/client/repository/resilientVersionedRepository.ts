// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryLocalConflictError,
  VersionedRepositoryRemoteError,
  type VersionedRepository,
  type VersionedRepositoryBackend,
  type VersionedContentConflictPreference,
  type VersionedContentMergePolicy,
  type VersionedContentPreparationPolicy,
  type VersionedRepositoryConflictProof,
  type VersionedRepositorySnapshot,
  type VersionedRepositorySyncResult,
} from "../../../application/persistence/versionedRepository";
import type { VersionedRepositoryCache } from "./versionedRepositoryCache";
import { LocalFirstRepositoryProjectionState } from "./resilientVersionedRepositoryProjection.ts";
import {
  LocalFirstRepositoryRemoteReconciliation,
} from "./resilientVersionedRepositoryRemoteReconciliation.ts";
import { LocalFirstRepositoryStaging } from "./resilientVersionedRepositoryStaging.ts";
import { LocalFirstRepositorySynchronization } from "./resilientVersionedRepositorySynchronization.ts";
import {
  canUseVersionedRepositoryCachedSnapshot,
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
  const synchronization = new LocalFirstRepositorySynchronization({
    backend,
    cache,
    createBusyError,
    createLocalRevision,
    preparation,
    projections,
    remoteReconciliation,
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
  const synchronize = async () => {
    const identity = await resolveIdentity();

    await ensureInitialized();
    return synchronization.synchronize(identity);
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
