// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  DomainChangeEventSource,
  DomainRevisionCheckpoint,
} from "../sync/domainChangeEvents";
import type {
  VersionedRepositoryPersistenceState,
} from "../persistence/versionedRepositorySaveQueue";

type PersistenceStatus = VersionedRepositoryPersistenceState<string>["status"];

export type CheckpointReloadState = {
  catalog: {
    activeRepositoryId: string | null;
    knownRepositoryIds: readonly string[] | null;
  };
  journalPersistenceStatus: PersistenceStatus | null;
  journalRemoteRevision: string | null;
  todoPersistenceStatus: PersistenceStatus | null;
  todoRemoteRevision: string | null;
  workspacePersistenceStatus: PersistenceStatus | null;
  workspaceRemoteRevision: string | null;
};

export type CheckpointReloadActions = {
  reloadCatalog(): Promise<unknown>;
  reloadJournal(): Promise<unknown>;
  reloadTodo(): Promise<unknown>;
  reloadWorkspace(): Promise<unknown>;
};

export type CheckpointReloadReconciler = {
  dispose(): void;
  notifyStateChanged(): void;
  start(): void;
};

export function createCheckpointReloadReconciler({
  actions,
  getState,
  source,
}: {
  actions: CheckpointReloadActions;
  getState(): CheckpointReloadState;
  source?: DomainChangeEventSource;
}): CheckpointReloadReconciler {
  let active = false;
  let disposed = false;
  let activeStreamId: string | null = null;
  let latestCheckpoint: DomainRevisionCheckpoint | null = null;
  let workspaceCatalogChangeSequence = -1;
  let catalogAttemptedSequence = -1;
  let catalogReloading = false;
  const workspaceAttemptedSequences = new Map<string, number>();
  let workspaceReloading = false;
  let journalAttemptedSequence = -1;
  let journalReloading = false;
  let todoAttemptedSequence = -1;
  let todoReloading = false;

  const reconcile = () => {
    if (disposed || !active || !latestCheckpoint) return;
    const sequence = latestCheckpoint.sequence;
    const state = getState();
    const knownRepositoryIds = state.catalog.knownRepositoryIds;
    const checkpointRepositoryIds = Object.keys(
      latestCheckpoint.workspaces,
    ).sort();
    const catalogMismatch = knownRepositoryIds !== null && (
      knownRepositoryIds.length !== checkpointRepositoryIds.length ||
      [...knownRepositoryIds].sort().some(
        (repositoryId, index) =>
          repositoryId !== checkpointRepositoryIds[index],
      )
    );

    if (
      knownRepositoryIds !== null &&
      !catalogReloading &&
      catalogAttemptedSequence < sequence &&
      (catalogMismatch ||
        catalogAttemptedSequence < workspaceCatalogChangeSequence)
    ) {
      catalogAttemptedSequence = sequence;
      catalogReloading = true;
      void actions.reloadCatalog()
        .catch(() => undefined)
        .finally(() => {
          catalogReloading = false;
          reconcile();
        });
    }

    const activeRepositoryId = state.catalog.activeRepositoryId;

    if (
      activeRepositoryId &&
      state.workspaceRemoteRevision !== null &&
      latestCheckpoint.workspaces[activeRepositoryId] &&
      state.workspaceRemoteRevision !==
        latestCheckpoint.workspaces[activeRepositoryId] &&
      state.workspacePersistenceStatus === "saved" &&
      !workspaceReloading &&
      (workspaceAttemptedSequences.get(activeRepositoryId) ?? -1) < sequence
    ) {
      workspaceAttemptedSequences.set(activeRepositoryId, sequence);
      workspaceReloading = true;
      void actions.reloadWorkspace()
        .catch(() => undefined)
        .finally(() => {
          workspaceReloading = false;
          reconcile();
        });
    }

    if (
      state.journalRemoteRevision !== null &&
      latestCheckpoint.journal &&
      state.journalRemoteRevision !== latestCheckpoint.journal &&
      state.journalPersistenceStatus === "saved" &&
      !journalReloading &&
      journalAttemptedSequence < sequence
    ) {
      journalAttemptedSequence = sequence;
      journalReloading = true;
      void actions.reloadJournal()
        .catch(() => undefined)
        .finally(() => {
          journalReloading = false;
          reconcile();
        });
    }

    if (
      state.todoRemoteRevision !== null &&
      latestCheckpoint.todo &&
      state.todoRemoteRevision !== latestCheckpoint.todo &&
      state.todoPersistenceStatus === "saved" &&
      !todoReloading &&
      todoAttemptedSequence < sequence
    ) {
      todoAttemptedSequence = sequence;
      todoReloading = true;
      void actions.reloadTodo()
        .catch(() => undefined)
        .finally(() => {
          todoReloading = false;
          reconcile();
        });
    }
  };

  const unsubscribe = source?.subscribe((event) => {
    if (activeStreamId !== event.streamId) {
      activeStreamId = event.streamId;
      latestCheckpoint = null;
      workspaceCatalogChangeSequence = -1;
      catalogAttemptedSequence = -1;
      workspaceAttemptedSequences.clear();
      journalAttemptedSequence = -1;
      todoAttemptedSequence = -1;
    }
    if (latestCheckpoint && event.sequence < latestCheckpoint.sequence) return;
    latestCheckpoint = event.checkpoint;
    if (event.changedDomains.workspaceCatalog) {
      workspaceCatalogChangeSequence = event.sequence;
    }
    reconcile();
  }) ?? (() => undefined);

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      source?.dispose();
    },
    notifyStateChanged: reconcile,
    start() {
      if (disposed || active) return;
      active = true;
      source?.start();
      reconcile();
    },
  };
}
