// SPDX-License-Identifier: GPL-3.0-or-later

export type VersionedRemoteSnapshot<Content, Revision extends string> = {
  content: Content;
  revision: Revision;
};

export type VersionedRemoteCommit<Content, Revision extends string> = {
  baseRevision: Revision;
  content: Content;
};

export type PreparedVersionedContent<Content, Projection> = Readonly<{
  content: Content;
  projection: Projection;
}>;

export type VersionedContentPreparationPolicy<Content, Projection> = {
  prepare(content: Content, previous?: Projection | null): Projection;
  validateTransition?(
    previous: PreparedVersionedContent<Content, Projection>,
    next: PreparedVersionedContent<Content, Projection>,
  ): void;
};

export type VersionedCommitResult<Revision extends string> = {
  revision: Revision;
};

export type VersionedRepositoryBackend<Content, Revision extends string> = {
  commitRemoteSnapshot(
    commit: VersionedRemoteCommit<Content, Revision>,
  ): Promise<VersionedCommitResult<Revision>>;
  loadRemoteSnapshot(): Promise<VersionedRemoteSnapshot<Content, Revision>>;
};

export type VersionedRepositorySnapshot<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Projection = unknown,
> = PreparedVersionedContent<Content, Projection> & {
  conflictRevision: Revision | null;
  localRevision: LocalRevision;
  pendingChanges: boolean;
  remoteRevision: Revision | null;
};

export type VersionedContentMergeResult<Content> =
  | { content: Content; status: "merged" }
  | { status: "conflict"; unitIds: string[] };

export type VersionedContentConflictPreference = "local" | "remote";

export type VersionedContentMergePolicy<Content> = (
  base: Content,
  local: Content,
  remote: Content,
  conflictPreference?: VersionedContentConflictPreference,
) => VersionedContentMergeResult<Content>;

export type PreparedVersionedContentMergePolicy<Content, Projection> = (
  base: PreparedVersionedContent<Content, Projection>,
  local: PreparedVersionedContent<Content, Projection>,
  remote: PreparedVersionedContent<Content, Projection>,
  conflictPreference?: VersionedContentConflictPreference,
) => PreparedVersionedContentMergeResult<Content, Projection>;

export type PreparedVersionedContentMergeResult<Content, Projection> =
  | (PreparedVersionedContent<Content, Projection> & { status: "merged" })
  | { status: "conflict"; unitIds: string[] };

export type VersionedRepositoryConflictRecord<
  Content,
  Revision extends string,
> = {
  base: Content;
  local: Content;
  remote: Content;
  remoteRevision: Revision;
  unitIds: string[];
};

export type PreparedVersionedConflictSources<Content, Projection> = Readonly<{
  local: PreparedVersionedContent<Content, Projection>;
  remote: PreparedVersionedContent<Content, Projection>;
}>;

type VersionedRepositorySyncResultBase<
  Revision extends string,
  LocalRevision extends string,
> = {
  localRevision: LocalRevision;
  remoteRevision: Revision | null;
};

export type VersionedRepositorySyncResult<
  Revision extends string,
  LocalRevision extends string,
> =
  | (VersionedRepositorySyncResultBase<Revision, LocalRevision> & {
      pendingChanges: boolean;
      status: "synced";
    })
  | (VersionedRepositorySyncResultBase<Revision, LocalRevision> & {
      pendingChanges: boolean;
      status: "offline";
    })
  | (VersionedRepositorySyncResultBase<Revision, LocalRevision> & {
      remoteRevision: Revision;
      status: "conflict";
    })
  | (VersionedRepositorySyncResultBase<Revision, LocalRevision> & {
      message: string;
      status: "sync-error";
    });

export type VersionedRepository<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Location,
  Projection = unknown,
> = {
  label: string;
  location: Location;
  discardPendingSnapshotAndReload(): Promise<
    VersionedRepositorySnapshot<Content, Revision, LocalRevision, Projection>
  >;
  loadSnapshot(): Promise<
    VersionedRepositorySnapshot<Content, Revision, LocalRevision, Projection>
  >;
  loadConflict?(): Promise<
    VersionedRepositoryConflictRecord<Content, Revision> | null
  >;
  keepLocalConflictAndSynchronize?(): Promise<
    VersionedRepositorySyncResult<Revision, LocalRevision>
  >;
  resolveConflictAndSynchronize?(
    preference: VersionedContentConflictPreference,
    transform?: (
      content: Content,
      conflict: VersionedRepositoryConflictRecord<Content, Revision>,
    ) => Content,
  ): Promise<VersionedRepositorySyncResult<Revision, LocalRevision>>;
  resolvePreparedConflictAndSynchronize?(
    preference: VersionedContentConflictPreference,
    transform: (
      prepared: PreparedVersionedContent<Content, Projection>,
      conflict: VersionedRepositoryConflictRecord<Content, Revision>,
      sources?: PreparedVersionedConflictSources<Content, Projection>,
    ) => PreparedVersionedContent<Content, Projection>,
  ): Promise<VersionedRepositorySyncResult<Revision, LocalRevision>>;
  stageSnapshot(input: {
    content: Content;
    expectedLocalRevision: LocalRevision;
    projection: Projection;
  }): Promise<{ localRevision: LocalRevision }>;
  subscribeReconnect(listener: () => void): () => void;
  synchronizePendingSnapshot(): Promise<
    VersionedRepositorySyncResult<Revision, LocalRevision>
  >;
};

export type VersionedRepositoryContentValidator<Content> = (
  content: Content,
) => void;

export type VersionedRepositoryTransitionValidator<Content> = (
  previous: Content,
  next: Content,
) => void;

export type VersionedRepositoryCodec<Content, Revision extends string> = {
  parseContent(value: unknown): Content;
  parseRevision(value: unknown): Revision;
  parseSnapshot(value: unknown): VersionedRemoteSnapshot<Content, Revision>;
};

export class VersionedRepositoryBackendConflictError<
  Revision extends string = string,
> extends Error {
  currentRevision: Revision;

  constructor(currentRevision: Revision) {
    super("Repository content changed outside the current session");
    this.name = "VersionedRepositoryBackendConflictError";
    this.currentRevision = currentRevision;
  }
}

export class VersionedRepositoryLocalConflictError<
  LocalRevision extends string = string,
> extends Error {
  currentRevision: LocalRevision;

  constructor(currentRevision: LocalRevision) {
    super("Repository local draft changed outside the current operation");
    this.name = "VersionedRepositoryLocalConflictError";
    this.currentRevision = currentRevision;
  }
}

export class VersionedRepositoryUnavailableError extends Error {
  constructor(message = "Repository is unavailable") {
    super(message);
    this.name = "VersionedRepositoryUnavailableError";
  }
}

export class VersionedRepositoryRemoteError<Code extends string = string>
  extends Error {
  code: Code | null;
  retryable: boolean;

  constructor(
    message: string,
    {
      code = null,
      retryable = false,
    }: {
      code?: Code | null;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "VersionedRepositoryRemoteError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function createVersionedLocalDraftRevision<
  LocalRevision extends string,
>(createId: () => string) {
  return `draft:${createId()}` as LocalRevision;
}
