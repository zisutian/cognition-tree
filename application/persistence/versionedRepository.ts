// SPDX-License-Identifier: GPL-3.0-or-later

export type VersionedRemoteSnapshot<Content, Revision extends string> = {
  content: Content;
  revision: Revision;
};

export type VersionedRemoteSyncRequest<Content, Revision extends string> = {
  base: VersionedRemoteSnapshot<Content, Revision>;
  content: Content;
};

export type VersionedRemoteSyncResult<Content, Revision extends string> = {
  outcome: "auto-merged" | "committed" | "unchanged";
  snapshot: VersionedRemoteSnapshot<Content, Revision>;
};

export type PreparedVersionedContent<Content, Projection> = Readonly<{
  content: Content;
  projection: Projection;
}>;

export type PreparedVersionedContentChange<
  Content,
  Projection,
  LocalRevision extends string,
> = Readonly<{
  after: PreparedVersionedContent<Content, Projection>;
  baseLocalRevision: LocalRevision;
  before: PreparedVersionedContent<Content, Projection>;
}>;

export type PreparedVersionedSnapshot<
  Content,
  Projection,
  Revision extends string,
> = PreparedVersionedContent<Content, Projection> & Readonly<{
  revision: Revision;
}>;

export type PreparedVersionedCommit<
  Content,
  Projection,
  Revision extends string,
> = PreparedVersionedContent<Content, Projection> & Readonly<{
  baseRevision: Revision;
}>;

export type PreparedVersionedCommitReceipt<
  Content,
  Projection,
  Revision extends string,
> = Readonly<{
  after: PreparedVersionedSnapshot<Content, Projection, Revision>;
  before: PreparedVersionedSnapshot<Content, Projection, Revision>;
  revision: Revision;
}>;

export type PreparedVersionedStore<
  Content,
  Projection,
  Revision extends string,
> = {
  commit(
    transaction: PreparedVersionedCommit<Content, Projection, Revision>,
  ): Promise<PreparedVersionedCommitReceipt<Content, Projection, Revision>>;
  loadSnapshot(): Promise<
    PreparedVersionedSnapshot<Content, Projection, Revision>
  >;
};

export type VersionedContentPreparationPolicy<Content, Projection> = {
  prepare(content: Content, previous?: Projection | null): Projection;
  validateTransition?(
    previous: PreparedVersionedContent<Content, Projection>,
    next: PreparedVersionedContent<Content, Projection>,
  ): void;
};

export type VersionedRepositoryBackend<Content, Revision extends string> = {
  loadRemoteSnapshot(): Promise<VersionedRemoteSnapshot<Content, Revision>>;
  synchronizeRemoteSnapshot(
    request: VersionedRemoteSyncRequest<Content, Revision>,
  ): Promise<VersionedRemoteSyncResult<Content, Revision>>;
};

export type VersionedRepositorySnapshot<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Projection = unknown,
> = PreparedVersionedContent<Content, Projection> & Readonly<{
  conflictRevision: Revision | null;
  localRevision: LocalRevision;
  pendingChanges: boolean;
  remoteRevision: Revision | null;
}>;

export type VersionedContentConflictPreference = "local" | "remote";

export type VersionedContentMergePolicy<Content, Projection> = (
  base: PreparedVersionedContent<Content, Projection>,
  local: PreparedVersionedContent<Content, Projection>,
  remote: PreparedVersionedContent<Content, Projection>,
  conflictPreference?: VersionedContentConflictPreference,
) => VersionedContentMergeResult<Content, Projection>;

export type VersionedContentMergeResult<Content, Projection> =
  | (PreparedVersionedContent<Content, Projection> & { status: "merged" })
  | { status: "conflict"; unitIds: string[] };

export type VersionedRepositoryConflictRecord<
  Content,
  Revision extends string,
> = Readonly<{
  base: Content;
  local: Content;
  remote: Content;
  remoteRevision: Revision;
  unitIds: readonly string[];
}>;

export type VersionedRepositoryConflictSnapshot<
  Content,
  Revision extends string,
  LocalRevision extends string,
> = VersionedRepositoryConflictRecord<Content, Revision> & Readonly<{
  localRevision: LocalRevision;
}>;

export type VersionedRepositoryConflictProof<
  Revision extends string,
  LocalRevision extends string,
> = Readonly<{
  localRevision: LocalRevision;
  remoteRevision: Revision;
}>;

export type VersionedRepositoryConflictDetails<Revision extends string> =
  Readonly<{
    remoteRevision: Revision;
    unitIds: readonly string[];
  }>;

export type PreparedVersionedConflictSources<Content, Projection> = Readonly<{
  local: PreparedVersionedContent<Content, Projection>;
  remote: PreparedVersionedContent<Content, Projection>;
}>;

export type PreparedVersionedConflictRecovery<Content, Projection> = Readonly<{
  coveredUnitIds: readonly string[];
  prepared: PreparedVersionedContent<Content, Projection>;
}>;

type VersionedRepositorySyncResultBase<
  Content,
  Projection,
  Revision extends string,
  LocalRevision extends string,
> = {
  transitions: readonly [
    VersionedRepositorySnapshotTransition<
      Content,
      Projection,
      Revision,
      LocalRevision
    >,
    ...VersionedRepositorySnapshotTransition<
      Content,
      Projection,
      Revision,
      LocalRevision
    >[],
  ];
};

export type VersionedRepositorySnapshotTransition<
  Content,
  Projection,
  Revision extends string,
  LocalRevision extends string,
> = Readonly<{
  previousLocalRevision: LocalRevision;
  snapshot: VersionedRepositorySnapshot<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;
}>;

export type VersionedRepositorySyncResult<
  Content,
  Projection,
  Revision extends string,
  LocalRevision extends string,
> =
  | (VersionedRepositorySyncResultBase<
      Content,
      Projection,
      Revision,
      LocalRevision
    > & {
      status: "synced";
    })
  | (VersionedRepositorySyncResultBase<
      Content,
      Projection,
      Revision,
      LocalRevision
    > & {
      status: "offline";
    })
  | (VersionedRepositorySyncResultBase<
      Content,
      Projection,
      Revision,
      LocalRevision
    > & {
      status: "conflict";
    })
  | (VersionedRepositorySyncResultBase<
      Content,
      Projection,
      Revision,
      LocalRevision
    > & {
      message: string;
      status: "sync-error";
    });

export function finalVersionedRepositoryTransition<
  Content,
  Projection,
  Revision extends string,
  LocalRevision extends string,
>(result: VersionedRepositorySyncResult<
  Content,
  Projection,
  Revision,
  LocalRevision
>) {
  const [first, ...remaining] = result.transitions;

  return remaining.at(-1) ?? first;
}

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
  loadConflict(): Promise<
    VersionedRepositoryConflictSnapshot<
      Content,
      Revision,
      LocalRevision
    > | null
  >;
  resolveConflictAndSynchronize(
    proof: VersionedRepositoryConflictProof<Revision, LocalRevision>,
    preference: VersionedContentConflictPreference,
    transform?: (
      prepared: PreparedVersionedContent<Content, Projection>,
      conflict: VersionedRepositoryConflictRecord<Content, Revision>,
      sources: PreparedVersionedConflictSources<Content, Projection>,
    ) => PreparedVersionedConflictRecovery<Content, Projection>,
  ): Promise<
    VersionedRepositorySyncResult<
      Content,
      Projection,
      Revision,
      LocalRevision
    >
  >;
  stageSnapshot(
    change: PreparedVersionedContentChange<
      Content,
      Projection,
      LocalRevision
    >,
  ): Promise<
    VersionedRepositorySnapshotTransition<
      Content,
      Projection,
      Revision,
      LocalRevision
    >
  >;
  subscribeReconnect(listener: () => void): () => void;
  synchronizePendingSnapshot(): Promise<
    VersionedRepositorySyncResult<
      Content,
      Projection,
      Revision,
      LocalRevision
    >
  >;
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

export class VersionedRepositoryBackendMergeConflictError<
  Revision extends string = string,
> extends Error {
  readonly baseRevision: Revision;
  readonly currentRevision: Revision;
  readonly unitIds: readonly string[];

  constructor(input: {
    baseRevision: Revision;
    currentRevision: Revision;
    unitIds: readonly string[];
  }) {
    super("Repository changes overlap with the current remote content");
    this.name = "VersionedRepositoryBackendMergeConflictError";
    this.baseRevision = input.baseRevision;
    this.currentRevision = input.currentRevision;
    this.unitIds = [...new Set(input.unitIds)].sort();
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

export class VersionedRepositoryLocalMergeConflictError extends Error {
  readonly unitIds: readonly string[];

  constructor(unitIds: readonly string[]) {
    super("Repository local changes overlap with the current draft");
    this.name = "VersionedRepositoryLocalMergeConflictError";
    this.unitIds = [...new Set(unitIds)].sort();
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
