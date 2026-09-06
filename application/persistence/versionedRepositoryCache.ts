// SPDX-License-Identifier: GPL-3.0-or-later

import type { VersionedRepositoryConflictRecord, VersionedRemoteSnapshot } from "./versionedRepository";

export type VersionedRepositoryLocalState<
  Content,
  Revision extends string,
  LocalRevision extends string,
> = {
  content: Content;
  localRevision: LocalRevision;
  pendingBaseRevision: Revision | null;
  remoteRevision: Revision | null;
};

export type VersionedRepositoryCache<
  Content,
  Revision extends string,
  LocalRevision extends string,
> = {
  create(input: {
    identity: string;
    localRevision: LocalRevision;
    snapshot: VersionedRemoteSnapshot<Content, Revision>;
  }): Promise<VersionedRepositoryLocalState<Content, Revision, LocalRevision>>;
  load(identity: string): Promise<
    VersionedRepositoryLocalState<Content, Revision, LocalRevision> | null
  >;
  loadSyncContext(identity: string): Promise<
    | {
        baseContent: Content | null;
        conflict: VersionedRepositoryConflictRecord<Content, Revision> | null;
      }
    | null
  >;
  recordConflict(input: {
    baseContent: Content;
    currentRemoteRevision: Revision;
    expectedLocalRevision: LocalRevision;
    identity: string;
    localRevision: LocalRevision;
    localContent: Content;
    remoteContent: Content;
    unitIds: readonly string[];
  }): Promise<VersionedRepositoryLocalState<Content, Revision, LocalRevision>>;
  rebaseFromRemote(input: {
    content: Content;
    expectedLocalRevision: LocalRevision;
    identity: string;
    localRevision: LocalRevision;
    pendingChanges: boolean;
    snapshot: VersionedRemoteSnapshot<Content, Revision>;
  }): Promise<VersionedRepositoryLocalState<Content, Revision, LocalRevision>>;
  remove(identity: string): Promise<void>;
  replaceFromRemote(input: {
    expectedLocalRevision: LocalRevision;
    identity: string;
    localRevision: LocalRevision;
    snapshot: VersionedRemoteSnapshot<Content, Revision>;
  }): Promise<VersionedRepositoryLocalState<Content, Revision, LocalRevision>>;
  stage(input: {
    conflictUnitIds: readonly string[] | null;
    content: Content;
    expectedLocalRevision: LocalRevision;
    identity: string;
    localRevision: LocalRevision;
  }): Promise<VersionedRepositoryLocalState<Content, Revision, LocalRevision>>;
};
