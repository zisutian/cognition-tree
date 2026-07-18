import type {
  LocalDraftRevisionDto,
  RepositoryApiErrorCodeDto,
  RepositoryLocationDto,
  RepositoryRevisionDto,
  WorkspaceRepositoryContentDto,
} from "../../../contracts/workspace-repository/types";
import {
  isRepositorySyntaxFileId,
  normalizeRepositorySyntaxProfileName,
} from "../../../contracts/workspace-repository/parseSyntax";
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
  type VersionedRepositorySnapshot,
  type VersionedRepositorySyncResult,
} from "./versionedRepository";

export type WorkspaceRepositoryContent = WorkspaceRepositoryContentDto;
export type WorkspaceRepositoryContentValidator =
  VersionedRepositoryContentValidator<WorkspaceRepositoryContent>;
export type LocalDraftRevision = LocalDraftRevisionDto;
export type RepositoryRevision = RepositoryRevisionDto;

/**
 * Storage-owned normalization shared by repository admission and the
 * application draft boundary. Application code must not consume wire-contract
 * helpers directly.
 */
export function normalizeWorkspaceSyntaxProfileName(value: string) {
  return normalizeRepositorySyntaxProfileName(value);
}

export function isWorkspaceSyntaxFileId(value: string) {
  return isRepositorySyntaxFileId(value);
}

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
  LocalDraftRevision
>;
export type WorkspaceRepositorySyncResult = VersionedRepositorySyncResult<
  RepositoryRevision,
  LocalDraftRevision
>;
export type WorkspaceRepository = VersionedRepository<
  WorkspaceRepositoryContent,
  RepositoryRevision,
  LocalDraftRevision,
  RepositoryLocationDto
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
  extends VersionedRepositoryRemoteError<RepositoryApiErrorCodeDto> {
  constructor(
    message: string,
    {
      code = null,
      retryable = false,
    }: {
      code?: RepositoryApiErrorCodeDto | null;
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
