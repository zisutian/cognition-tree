import {
  parseWorkspaceRepositoryContent,
  parseWorkspaceRepositorySnapshot,
} from "../../../contracts/workspace-repository/parseRepository";
import { parseRepositoryRevision } from "../../../contracts/workspace-repository/revision";
import type {
  LocalDraftRevision,
  RepositoryRevision,
  WorkspaceRepositoryContent,
} from "./workspaceRepository";
import { WorkspaceRepositoryLocalConflictError } from "./workspaceRepository";
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
