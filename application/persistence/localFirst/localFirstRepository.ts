// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryRemoteError,
  type VersionedRepository,
  type VersionedRepositoryBackend,
  type VersionedContentMergePolicy,
  type VersionedContentPreparationPolicy,
  type VersionedRepositorySnapshot,
  type VersionedRepositorySyncResult,
} from "../versionedRepository.ts";
import type { VersionedRepositoryCache } from "../versionedRepositoryCache.ts";
import {
  LocalFirstRepositoryConflictResolution,
} from "./localFirstRepositoryConflictResolution.ts";
import {
  LocalFirstRepositoryLoading,
  type VersionedRepositoryLoadPolicy,
} from "./localFirstRepositoryLoading.ts";
import { LocalFirstRepositoryProjectionState } from "./localFirstRepositoryProjection.ts";
import {
  LocalFirstRepositoryRemoteReconciliation,
} from "./localFirstRepositoryRemoteReconciliation.ts";
import { LocalFirstRepositoryStaging } from "./localFirstRepositoryStaging.ts";
import { LocalFirstRepositorySynchronization } from "./localFirstRepositorySynchronization.ts";

export type { VersionedRepositoryLoadPolicy } from "./localFirstRepositoryLoading.ts";

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
  const conflictResolution = new LocalFirstRepositoryConflictResolution({
    cache,
    createLocalRevision,
    mergeContent,
    preparation,
    projections,
    synchronization,
  });
  const loading = new LocalFirstRepositoryLoading({
    backend,
    cache,
    createLocalRevision,
    loadPolicy,
    projections,
    remoteReconciliation,
  });
  const resolveIdentity = () => Promise.resolve(repositoryIdentity);

  const runExplicitLoad = async () => {
    const identity = await resolveIdentity();
    return loading.load(identity);
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
    return conflictResolution.load(identity);
  };
  const resolveConflictAndSynchronize: VersionedRepository<
    Content,
    Revision,
    LocalRevision,
    Location,
    Projection
  >["resolveConflictAndSynchronize"] = async (
    proof,
    preference,
    transform,
  ) => {
    const identity = await resolveIdentity();

    await ensureInitialized();
    return conflictResolution.resolve(
      identity,
      proof,
      preference,
      transform,
    );
  };

  return {
    label,
    location,
    async discardPendingSnapshotAndReload() {
      const identity = await resolveIdentity();
      await ensureInitialized();
      return loading.discardPendingAndReload(identity);
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
