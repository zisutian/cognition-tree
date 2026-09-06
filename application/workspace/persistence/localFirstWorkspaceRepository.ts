// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createLocalFirstVersionedRepository,
  type VersionedRepositoryLoadPolicy,
} from "../../persistence/index.ts";
import type { VersionedRepositoryCache } from "../../persistence/index.ts";
import type { WorkspaceRepositoryContent, RepositoryRevision } from "./workspaceRepository.ts";
import {
  createLocalDraftRevision,
  type LocalDraftRevision,
  type WorkspaceRepository,
  type WorkspaceRepositoryBackend,
  type WorkspaceRepositoryPreparationPolicy,
  WorkspaceRepositoryRemoteError,
} from "./workspaceRepository.ts";
import { mergeWorkspaceContent } from "./workspaceThreeWayMerge.ts";

type LocalFirstWorkspaceRepositoryOptions = {
  backend: WorkspaceRepositoryBackend;
  cache: VersionedRepositoryCache<WorkspaceRepositoryContent, RepositoryRevision, LocalDraftRevision>;
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
