// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  PreparedVersionedContent,
  VersionedRepositorySnapshot,
  VersionedRepositorySnapshotTransition,
} from "../../../application/persistence/versionedRepository";
import type {
  VersionedRepositoryLocalState,
} from "./versionedRepositoryCache";

export interface LocalFirstRepositoryProjectionPort<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Projection,
> {
  clearLocal(): void;
  clearRemoteBase(): void;
  localProjection(): Projection | undefined;
  prepare(
    content: Content,
    previous?: Projection | null,
  ): PreparedVersionedContent<Content, Projection>;
  prepareLocalState(
    state: VersionedRepositoryLocalState<Content, Revision, LocalRevision>,
    previous?: Projection | null,
  ): PreparedVersionedContent<Content, Projection>;
  prepareMergeBase(
    content: Content,
    current: VersionedRepositoryLocalState<Content, Revision, LocalRevision>,
    currentPrepared: PreparedVersionedContent<Content, Projection>,
    contentEqual: (left: Content, right: Content) => boolean,
  ): PreparedVersionedContent<Content, Projection>;
  prepareRemote(
    content: Content,
    revision: Revision,
    previous?: Projection | null,
  ): PreparedVersionedContent<Content, Projection>;
  readRemoteBase(
    revision: Revision,
  ): PreparedVersionedContent<Content, Projection> | null;
  rememberLocal(
    state: VersionedRepositoryLocalState<Content, Revision, LocalRevision>,
    value: PreparedVersionedContent<Content, Projection>,
  ): PreparedVersionedContent<Content, Projection>;
  rememberRemote(
    revision: Revision,
    value: PreparedVersionedContent<Content, Projection>,
  ): void;
  toSnapshot(
    state: VersionedRepositoryLocalState<Content, Revision, LocalRevision>,
    prepared?: PreparedVersionedContent<Content, Projection>,
  ): VersionedRepositorySnapshot<
    Content,
    Revision,
    LocalRevision,
    Projection
  >;
  toTransition(
    previousLocalRevision: LocalRevision,
    state: VersionedRepositoryLocalState<Content, Revision, LocalRevision>,
    prepared?: PreparedVersionedContent<Content, Projection>,
  ): VersionedRepositorySnapshotTransition<
    Content,
    Projection,
    Revision,
    LocalRevision
  >;
}
