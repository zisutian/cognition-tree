// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  LocalDraftRevision,
  RepositoryRevision,
  WorkspaceRepository,
  WorkspaceRepositoryContent,
  WorkspaceRepositorySnapshot,
} from "../../../storage/repository/workspaceRepository";
import {
  createVersionedRepositorySaveQueue,
  versionedRepositoryRetryDelaysMs,
  versionedRepositorySaveDelayMs,
  type VersionedRepositoryPersistenceState,
  type VersionedRepositorySaveQueue,
} from "../../repository/versionedRepositorySaveQueue";

export type WorkspacePersistenceState =
  VersionedRepositoryPersistenceState<RepositoryRevision>;

type WorkspaceSessionSaveQueueOptions = {
  initialPersistenceState?: WorkspacePersistenceState;
  initialSnapshot: WorkspaceRepositorySnapshot;
  onLocalStaged: (
    content: WorkspaceRepositoryContent,
    localRevision: LocalDraftRevision,
  ) => void;
  onPersistenceChange: (state: WorkspacePersistenceState) => void;
  onRemoteRevision: (revision: RepositoryRevision | null) => void;
  repository: WorkspaceRepository;
};

export type WorkspaceSessionSaveQueue = VersionedRepositorySaveQueue<
  WorkspaceRepositoryContent,
  LocalDraftRevision
>;

export const workspaceSessionSaveDelayMs = versionedRepositorySaveDelayMs;
export const workspaceSessionRetryDelaysMs = versionedRepositoryRetryDelaysMs;

export function createWorkspaceSessionSaveQueue(
  options: WorkspaceSessionSaveQueueOptions,
): WorkspaceSessionSaveQueue {
  return createVersionedRepositorySaveQueue(options);
}
