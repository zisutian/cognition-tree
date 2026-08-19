import type {
  LocalDraftRevision,
  RepositoryRevision,
  WorkspaceRepositoryContent,
} from "../../../application/repository/workspaceRepository";
import { WorkspaceRepositoryLocalConflictError } from "../../../application/repository/workspaceRepository";
import {
  createMemoryVersionedRepositoryCache,
  type VersionedRepositoryCache,
  type VersionedRepositoryLocalState,
} from "./versionedRepositoryCache";

export type WorkspaceRepositoryLocalState = VersionedRepositoryLocalState<
  WorkspaceRepositoryContent,
  RepositoryRevision,
  LocalDraftRevision
>;

export type WorkspaceRepositoryCache = VersionedRepositoryCache<
  WorkspaceRepositoryContent,
  RepositoryRevision,
  LocalDraftRevision
>;

export function createMemoryWorkspaceRepositoryCache(): WorkspaceRepositoryCache {
  return createMemoryVersionedRepositoryCache({
    createLocalConflictError: (revision) =>
      new WorkspaceRepositoryLocalConflictError(revision),
  });
}
