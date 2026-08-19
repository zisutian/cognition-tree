import type { WorkspaceSyntaxCatalog } from "../../../core/workspace/model/workspaceSyntaxCatalog.ts";
import type { WorkspaceData } from "../../../core/workspace/model/workspaceData.ts";
import type { WorkspaceContext } from "../../../core/workspace/context/workspaceContext.ts";
import type { WorkspaceSyntax } from "../../../core/workspace/context/workspaceSyntax.ts";
import type { WorkspaceParseIndex } from "../../../core/workspace/indexes/workspaceParseIndex.ts";
import type { WorkspaceStructureIndex } from "../../../core/workspace/indexes/workspaceStructureIndex.ts";
import {
  createVersionedLocalDraftRevision,
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryLocalConflictError,
  VersionedRepositoryRemoteError,
  VersionedRepositoryUnavailableError,
  type VersionedCommitResult,
  type VersionedRemoteCommit,
  type VersionedRemoteSnapshot,
  type VersionedRepository,
  type VersionedRepositoryBackend,
  type VersionedRepositoryContentValidator,
  type VersionedContentPreparationPolicy,
  type VersionedRepositorySnapshot,
  type VersionedRepositorySyncResult,
} from "../../persistence/versionedRepository.ts";

export type WorkspaceRepositoryContent = {
  schemaVersion: 4;
  syntax: WorkspaceSyntaxCatalog;
  workspace: WorkspaceData;
};
export type WorkspaceRepositoryPreparation = {
  analysisIndex: WorkspaceParseIndex | null;
  context: WorkspaceContext | null;
  syntaxById: ReadonlyMap<string, WorkspaceSyntax>;
  workspace: WorkspaceStructureIndex;
  workspaceSyntax: WorkspaceSyntax | null;
};
export type WorkspaceRepositoryContentValidator =
  VersionedRepositoryContentValidator<WorkspaceRepositoryContent>;
export type WorkspaceRepositoryPreparationPolicy =
  VersionedContentPreparationPolicy<
    WorkspaceRepositoryContent,
    WorkspaceRepositoryPreparation
  >;
export type LocalDraftRevision = `draft:${string}`;
export type RepositoryRevision = `sha256:${string}`;
export type RepositoryLocation =
  | {
      hostPath: string | null;
      serverPath: string;
      type: "local";
    }
  | { type: "webdav"; url: string };
export type RepositoryApiErrorCode =
  | "invalid_request"
  | "repository_not_found"
  | "unsupported_repository_version"
  | "revision_conflict"
  | "repository_busy"
  | "repository_corrupt"
  | "adapter_unavailable"
  | "insufficient_storage"
  | "unauthorized"
  | "internal_error";

export type RemoteWorkspaceSnapshot = VersionedRemoteSnapshot<
  WorkspaceRepositoryContent,
  RepositoryRevision
>;
export type RemoteWorkspaceCommit = VersionedRemoteCommit<
  WorkspaceRepositoryContent,
  RepositoryRevision
>;
export type RemoteCommitResult = VersionedCommitResult<RepositoryRevision>;
export type WorkspaceRepositoryBackend = VersionedRepositoryBackend<
  WorkspaceRepositoryContent,
  RepositoryRevision
>;
export type WorkspaceRepositorySnapshot = VersionedRepositorySnapshot<
  WorkspaceRepositoryContent,
  RepositoryRevision,
  LocalDraftRevision,
  WorkspaceRepositoryPreparation
>;
export type WorkspaceRepositorySyncResult = VersionedRepositorySyncResult<
  RepositoryRevision,
  LocalDraftRevision
>;
export type WorkspaceRepository = VersionedRepository<
  WorkspaceRepositoryContent,
  RepositoryRevision,
  LocalDraftRevision,
  RepositoryLocation,
  WorkspaceRepositoryPreparation
>;

export class WorkspaceRepositoryBackendConflictError
  extends VersionedRepositoryBackendConflictError<RepositoryRevision> {

  constructor(currentRevision: RepositoryRevision) {
    super(currentRevision);
    this.name = "WorkspaceRepositoryBackendConflictError";
  }
}

export class WorkspaceRepositoryLocalConflictError
  extends VersionedRepositoryLocalConflictError<LocalDraftRevision> {
  constructor(currentRevision: LocalDraftRevision) {
    super(currentRevision);
    this.name = "WorkspaceRepositoryLocalConflictError";
  }
}

export class WorkspaceRepositoryUnavailableError
  extends VersionedRepositoryUnavailableError {
  constructor(message = "Repository is unavailable") {
    super(message);
    this.name = "WorkspaceRepositoryUnavailableError";
  }
}

export class WorkspaceRepositoryRemoteError
  extends VersionedRepositoryRemoteError<RepositoryApiErrorCode> {
  constructor(
    message: string,
    {
      code = null,
      retryable = false,
    }: {
      code?: RepositoryApiErrorCode | null;
      retryable?: boolean;
    } = {},
  ) {
    super(message, { code, retryable });
    this.name = "WorkspaceRepositoryRemoteError";
  }
}

export function createLocalDraftRevision(
  createId: () => string,
): LocalDraftRevision {
  return createVersionedLocalDraftRevision<LocalDraftRevision>(createId);
}
