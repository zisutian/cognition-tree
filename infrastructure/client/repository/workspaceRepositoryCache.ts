import type {
  LocalDraftRevision,
  RepositoryRevision,
  WorkspaceRepositoryContent,
} from "../../../application/workspace/index.ts";
import { WorkspaceRepositoryLocalConflictError } from "../../../application/workspace/index.ts";
import { createMemoryVersionedRepositoryCache } from "./versionedRepositoryCache.ts";
import { type VersionedRepositoryCache, type VersionedRepositoryLocalState } from "../../../application/persistence/index.ts";

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
