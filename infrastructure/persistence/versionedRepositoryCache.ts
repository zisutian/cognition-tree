// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryLocalConflictError,
  type VersionedRemoteSnapshot,
  type VersionedRepositoryCodec,
} from "../../application/persistence/versionedRepository";

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
  completeSync(input: {
    committedRemoteRevision: Revision;
    expectedLocalRevision: LocalRevision;
    identity: string;
  }): Promise<VersionedRepositoryLocalState<Content, Revision, LocalRevision>>;
  create(input: {
    identity: string;
    localRevision: LocalRevision;
    snapshot: VersionedRemoteSnapshot<Content, Revision>;
  }): Promise<VersionedRepositoryLocalState<Content, Revision, LocalRevision>>;
  load(identity: string): Promise<
    VersionedRepositoryLocalState<Content, Revision, LocalRevision> | null
  >;
  recordConflict(input: {
    currentRemoteRevision: Revision;
    identity: string;
  }): Promise<VersionedRepositoryLocalState<Content, Revision, LocalRevision>>;
  remove(identity: string): Promise<void>;
  replaceFromRemote(input: {
    expectedLocalRevision: LocalRevision;
    identity: string;
    localRevision: LocalRevision;
    snapshot: VersionedRemoteSnapshot<Content, Revision>;
  }): Promise<VersionedRepositoryLocalState<Content, Revision, LocalRevision>>;
  stage(input: {
    content: Content;
    expectedLocalRevision: LocalRevision;
    identity: string;
    localRevision: LocalRevision;
  }): Promise<VersionedRepositoryLocalState<Content, Revision, LocalRevision>>;
};

function cloneState<Content, Revision extends string, LocalRevision extends string>(
  state: VersionedRepositoryLocalState<Content, Revision, LocalRevision>,
) {
  return structuredClone(state);
}

export function createMemoryVersionedRepositoryCache<
  Content,
  Revision extends string,
  LocalRevision extends string,
>({
  codec,
  createLocalConflictError = (revision) =>
    new VersionedRepositoryLocalConflictError(revision),
}: {
  codec: VersionedRepositoryCodec<Content, Revision>;
  createLocalConflictError?: (revision: LocalRevision) => Error;
}): VersionedRepositoryCache<Content, Revision, LocalRevision> {
  type State = VersionedRepositoryLocalState<Content, Revision, LocalRevision>;
  const states = new Map<string, State>();
  const requireState = (identity: string) => {
    const state = states.get(identity);

    if (!state) {
      throw new Error(`Local repository state does not exist: ${identity}`);
    }
    return state;
  };

  return {
    async completeSync({
      committedRemoteRevision,
      expectedLocalRevision,
      identity,
    }) {
      const parsedRemoteRevision = codec.parseRevision(committedRemoteRevision);
      const current = requireState(identity);
      const unchanged = current.localRevision === expectedLocalRevision;
      const next = {
        ...current,
        pendingBaseRevision: unchanged ? null : parsedRemoteRevision,
        remoteRevision: parsedRemoteRevision,
      };

      states.set(identity, next);
      return cloneState(next);
    },
    async create({ identity, localRevision, snapshot }) {
      const parsedSnapshot = codec.parseSnapshot(snapshot);

      if (states.has(identity)) {
        throw new Error(`Local repository state already exists: ${identity}`);
      }
      const state: State = {
        content: parsedSnapshot.content,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsedSnapshot.revision,
      };

      states.set(identity, cloneState(state));
      return cloneState(state);
    },
    async load(identity) {
      const state = states.get(identity);

      return state ? cloneState(state) : null;
    },
    async recordConflict({ currentRemoteRevision, identity }) {
      const current = requireState(identity);
      const next = {
        ...current,
        remoteRevision: codec.parseRevision(currentRemoteRevision),
      };

      states.set(identity, next);
      return cloneState(next);
    },
    async remove(identity) {
      states.delete(identity);
    },
    async replaceFromRemote({
      expectedLocalRevision,
      identity,
      localRevision,
      snapshot,
    }) {
      const parsedSnapshot = codec.parseSnapshot(snapshot);
      const current = requireState(identity);

      if (current.localRevision !== expectedLocalRevision) {
        throw createLocalConflictError(current.localRevision);
      }
      const state: State = {
        content: parsedSnapshot.content,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsedSnapshot.revision,
      };

      states.set(identity, cloneState(state));
      return cloneState(state);
    },
    async stage({ content, expectedLocalRevision, identity, localRevision }) {
      const parsedContent = codec.parseContent(content);
      const current = requireState(identity);

      if (current.localRevision !== expectedLocalRevision) {
        throw createLocalConflictError(current.localRevision);
      }
      if (!current.pendingBaseRevision && !current.remoteRevision) {
        throw new Error("Cannot stage a repository without a known remote base.");
      }
      const next = {
        ...current,
        content: parsedContent,
        localRevision,
        pendingBaseRevision:
          current.pendingBaseRevision ?? current.remoteRevision,
      };

      states.set(identity, cloneState(next));
      return cloneState(next);
    },
  };
}
