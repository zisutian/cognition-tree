// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createLocalFirstVersionedRepository,
  type VersionedRepositoryLoadPolicy,
} from "./resilientVersionedRepository";
import type { WorkspaceRepositoryCache } from "./workspaceRepositoryCache";
import {
  createLocalDraftRevision,
  type LocalDraftRevision,
  type WorkspaceRepository,
  type WorkspaceRepositoryBackend,
  type WorkspaceRepositoryPreparationPolicy,
  WorkspaceRepositoryRemoteError,
} from "../../../application/repository/workspaceRepository";
import {
  mergeWorkspaceContent,
} from "../../../application/sync/domainThreeWayMerge";

type LocalFirstWorkspaceRepositoryOptions = {
  backend: WorkspaceRepositoryBackend;
  cache: WorkspaceRepositoryCache;
  createDraftId: () => string;
  label: string;
  loadPolicy: VersionedRepositoryLoadPolicy;
  location: WorkspaceRepository["location"];
  repositoryIdentity: string | Promise<string>;
  subscribeReconnect?: (listener: () => void) => () => void;
  preparation: WorkspaceRepositoryPreparationPolicy;
};

export function createLocalFirstWorkspaceRepository({
  createDraftId,
  ...options
}: LocalFirstWorkspaceRepositoryOptions): WorkspaceRepository {
  return createLocalFirstVersionedRepository({
    ...options,
    createBusyError: () => new WorkspaceRepositoryRemoteError(
      "Local repository state kept changing during remote refresh.",
      { code: "repository_busy", retryable: true },
    ),
    createLocalRevision: () => createLocalDraftRevision(createDraftId),
    mergeContent: mergeWorkspaceContent,
  });
}

export function isSameLocalRevision(
  left: LocalDraftRevision,
  right: LocalDraftRevision,
) {
  return left === right;
}
