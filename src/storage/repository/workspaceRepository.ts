import type {
  LocalDraftRevisionDto,
  RepositoryRevisionDto,
  WorkspaceRepositoryContentDto,
} from "../../../contracts/workspace-repository/types";

export type WorkspaceRepositoryContent = WorkspaceRepositoryContentDto;
export type WorkspaceRepositoryContentValidator = (
  content: WorkspaceRepositoryContent,
) => void;
export type LocalDraftRevision = LocalDraftRevisionDto;
export type RepositoryRevision = RepositoryRevisionDto;

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
  locationLabel: string;
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
  retryable: boolean;

  constructor(message: string, { retryable = false } = {}) {
    super(message);
    this.name = "WorkspaceRepositoryRemoteError";
    this.retryable = retryable;
  }
}

export function createLocalDraftRevision(
  createId: () => string,
): LocalDraftRevision {
  return `draft:${createId()}` as LocalDraftRevision;
}
