import type {
  WorkspaceSyntaxCatalog,
  WorkspaceData,
  WorkspaceContext,
  WorkspaceSyntax,
  WorkspaceParseIndex,
  WorkspaceStructureIndex,
} from "../../../core/workspace/index.ts";





import type {
  RepositoryApiErrorCode,
  RepositoryLocation,
} from "../../repository/index.ts";
import {
  createVersionedLocalDraftRevision,
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryLocalConflictError,
  VersionedRepositoryRemoteError,
  VersionedRepositoryUnavailableError,
  type VersionedRemoteSyncRequest,
  type VersionedRemoteSyncResult,
  type VersionedRemoteSnapshot,
  type VersionedRepository,
  type VersionedRepositoryBackend,
  type VersionedRepositoryContentValidator,
  type VersionedContentPreparationPolicy,
  type VersionedRepositorySnapshot,
  type VersionedRepositorySyncResult,
} from "../../persistence/index.ts";

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
export type RemoteWorkspaceSnapshot = VersionedRemoteSnapshot<
  WorkspaceRepositoryContent,
  RepositoryRevision
>;
export type RemoteWorkspaceSyncRequest = VersionedRemoteSyncRequest<
  WorkspaceRepositoryContent,
  RepositoryRevision
>;
export type RemoteWorkspaceSyncResult = VersionedRemoteSyncResult<
  WorkspaceRepositoryContent,
  RepositoryRevision
>;
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
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation,
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
