import {
  parseWorkspaceRepositoryContent,
  parseWorkspaceRepositorySnapshot,
} from "../../contracts/workspace/parseRepository";
import { parseRepositoryRevision } from "../../contracts/workspace/revision";
import type {
  LocalDraftRevision,
  RepositoryRevision,
  WorkspaceRepositoryContent,
} from "../../application/repository/workspaceRepository";
import { WorkspaceRepositoryLocalConflictError } from "../../application/repository/workspaceRepository";
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
    codec: {
      parseContent: parseWorkspaceRepositoryContent,
      parseRevision: parseRepositoryRevision,
      parseSnapshot: parseWorkspaceRepositorySnapshot,
    },
    createLocalConflictError: (revision) =>
      new WorkspaceRepositoryLocalConflictError(revision),
  });
}
