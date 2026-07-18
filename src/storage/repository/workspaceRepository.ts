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

export type WorkspaceRepositoryContent = WorkspaceRepositoryContentDto;
export type WorkspaceRepositoryContentValidator = (
  content: WorkspaceRepositoryContent,
) => void;
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

export type RemoteWorkspaceSnapshot = {
  content: WorkspaceRepositoryContent;
  revision: RepositoryRevision;
};

export type RemoteWorkspaceCommit = {
  baseRevision: RepositoryRevision;
  content: WorkspaceRepositoryContent;
};

export type RemoteCommitResult = {
  revision: RepositoryRevision;
};

export type WorkspaceRepositoryBackend = {
  commitRemoteSnapshot(
    commit: RemoteWorkspaceCommit,
  ): Promise<RemoteCommitResult>;
  loadRemoteSnapshot(): Promise<RemoteWorkspaceSnapshot>;
};

export type WorkspaceRepositorySnapshot = {
  conflictRevision: RepositoryRevision | null;
  content: WorkspaceRepositoryContent;
  localRevision: LocalDraftRevision;
  pendingChanges: boolean;
  remoteRevision: RepositoryRevision | null;
};

type WorkspaceRepositorySyncResultBase = {
  localRevision: LocalDraftRevision;
  remoteRevision: RepositoryRevision | null;
};

export type WorkspaceRepositorySyncResult =
  | (WorkspaceRepositorySyncResultBase & {
      pendingChanges: boolean;
      status: "synced";
    })
  | (WorkspaceRepositorySyncResultBase & {
      pendingChanges: boolean;
      status: "offline";
    })
  | (WorkspaceRepositorySyncResultBase & {
      remoteRevision: RepositoryRevision;
      status: "conflict";
    })
  | (WorkspaceRepositorySyncResultBase & {
      message: string;
      status: "sync-error";
    });

export type WorkspaceRepository = {
  label: string;
  location: RepositoryLocationDto;
  discardPendingSnapshotAndReload(): Promise<WorkspaceRepositorySnapshot>;
  loadSnapshot(): Promise<WorkspaceRepositorySnapshot>;
  stageSnapshot(input: {
    content: WorkspaceRepositoryContent;
    expectedLocalRevision: LocalDraftRevision;
  }): Promise<{ localRevision: LocalDraftRevision }>;
  subscribeReconnect(listener: () => void): () => void;
  synchronizePendingSnapshot(): Promise<WorkspaceRepositorySyncResult>;
};

export class WorkspaceRepositoryBackendConflictError extends Error {
  currentRevision: RepositoryRevision;

  constructor(currentRevision: RepositoryRevision) {
    super("Repository content changed outside the current session");
    this.name = "WorkspaceRepositoryBackendConflictError";
    this.currentRevision = currentRevision;
  }
}

export class WorkspaceRepositoryLocalConflictError extends Error {
  currentRevision: LocalDraftRevision;

  constructor(currentRevision: LocalDraftRevision) {
    super("Repository local draft changed outside the current operation");
    this.name = "WorkspaceRepositoryLocalConflictError";
    this.currentRevision = currentRevision;
  }
}

export class WorkspaceRepositoryUnavailableError extends Error {
  constructor(message = "Repository is unavailable") {
    super(message);
    this.name = "WorkspaceRepositoryUnavailableError";
  }
}

export class WorkspaceRepositoryRemoteError extends Error {
  code: RepositoryApiErrorCodeDto | null;
  retryable: boolean;

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
    super(message);
    this.name = "WorkspaceRepositoryRemoteError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function createLocalDraftRevision(
  createId: () => string,
): LocalDraftRevision {
  return `draft:${createId()}` as LocalDraftRevision;
}
