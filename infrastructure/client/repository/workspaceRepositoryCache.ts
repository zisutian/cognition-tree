import type {
  LocalDraftRevision,
  RepositoryRevision,
  WorkspaceRepositoryContent,
} from "../../../application/workspace/persistence/workspaceRepository";
import { WorkspaceRepositoryLocalConflictError } from "../../../application/workspace/persistence/workspaceRepository";
import { createMemoryVersionedRepositoryCache } from "./versionedRepositoryCache";
import { type VersionedRepositoryCache, type VersionedRepositoryLocalState } from "../../../application/persistence/versionedRepositoryCache";

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
