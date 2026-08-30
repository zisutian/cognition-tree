// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  PreparedVersionedContent,
  VersionedContentPreparationPolicy,
  VersionedRepositorySnapshot,
  VersionedRepositorySnapshotTransition,
} from "../../../application/persistence/versionedRepository.ts";
import type { VersionedRepositoryLocalState } from "./versionedRepositoryCache.ts";
import type {
  LocalFirstRepositoryProjectionPort,
} from "./localFirstRepositoryProjectionPort.ts";

export class LocalFirstRepositoryProjectionState<
  Content,
  Revision extends string,
  LocalRevision extends string,
  Projection,
> implements LocalFirstRepositoryProjectionPort<
  Content,
  Revision,
  LocalRevision,
  Projection
> {
  #local: {
    localRevision: LocalRevision;
    projection: Projection;
  } | null = null;
  readonly #preparation: VersionedContentPreparationPolicy<Content, Projection>;
  #remoteBase: {
    revision: Revision;
    value: PreparedVersionedContent<Content, Projection>;
  } | null = null;

  constructor(
    preparation: VersionedContentPreparationPolicy<Content, Projection>,
  ) {
    this.#preparation = preparation;
  }

  clearLocal() {
    this.#local = null;
  }

  clearRemoteBase() {
    this.#remoteBase = null;
  }

  localProjection() {
    return this.#local?.projection;
  }

  prepare(
    content: Content,
    previous?: Projection | null,
  ): PreparedVersionedContent<Content, Projection> {
    return {
      content,
      projection: this.#preparation.prepare(content, previous),
    };
  }

  prepareLocalState(
    state: VersionedRepositoryLocalState<Content, Revision, LocalRevision>,
    previous?: Projection | null,
  ) {
    if (this.#local?.localRevision === state.localRevision) {
      return {
        content: state.content,
        projection: this.#local.projection,
      };
    }
    const value = this.prepare(
      state.content,
      previous ?? this.#local?.projection,
    );

    this.#local = {
      localRevision: state.localRevision,
      projection: value.projection,
    };
    return value;
  }

  prepareRemote(
    content: Content,
    revision: Revision,
    previous?: Projection | null,
  ) {
    if (this.#remoteBase?.revision === revision) {
      return {
        content,
        projection: this.#remoteBase.value.projection,
      };
    }
    const value = this.prepare(content, previous);

    this.#remoteBase = { revision, value };
    return value;
  }

  prepareMergeBase(
    content: Content,
    current: VersionedRepositoryLocalState<Content, Revision, LocalRevision>,
    currentPrepared: PreparedVersionedContent<Content, Projection>,
    contentEqual: (left: Content, right: Content) => boolean,
  ) {
    return current.pendingBaseRevision !== null &&
        this.#remoteBase?.revision === current.pendingBaseRevision &&
        contentEqual(this.#remoteBase.value.content, content)
      ? this.#remoteBase.value
      : this.prepare(content, currentPrepared.projection);
  }

  readRemoteBase(revision: Revision) {
    return this.#remoteBase?.revision === revision
      ? this.#remoteBase.value
      : null;
  }

  rememberLocal(
    state: VersionedRepositoryLocalState<Content, Revision, LocalRevision>,
    value: PreparedVersionedContent<Content, Projection>,
  ) {
    this.#local = {
      localRevision: state.localRevision,
      projection: value.projection,
    };
    return { content: state.content, projection: value.projection };
  }

  rememberRemote(
    revision: Revision,
    value: PreparedVersionedContent<Content, Projection>,
  ) {
    this.#remoteBase = { revision, value };
  }

  toSnapshot(
    state: VersionedRepositoryLocalState<Content, Revision, LocalRevision>,
    prepared = this.prepareLocalState(state),
  ): VersionedRepositorySnapshot<
    Content,
    Revision,
    LocalRevision,
    Projection
  > {
    return {
      conflictRevision:
        state.pendingBaseRevision !== null &&
          state.remoteRevision !== null &&
          state.pendingBaseRevision !== state.remoteRevision
          ? state.remoteRevision
          : null,
      content: state.content,
      localRevision: state.localRevision,
      pendingChanges: state.pendingBaseRevision !== null,
      projection: prepared.projection,
      remoteRevision: state.remoteRevision,
    };
  }

  toTransition(
    previousLocalRevision: LocalRevision,
    state: VersionedRepositoryLocalState<Content, Revision, LocalRevision>,
    prepared = this.prepareLocalState(state),
  ): VersionedRepositorySnapshotTransition<
    Content,
    Projection,
    Revision,
    LocalRevision
  > {
    return {
      previousLocalRevision,
      snapshot: this.toSnapshot(state, prepared),
    };
  }
}
