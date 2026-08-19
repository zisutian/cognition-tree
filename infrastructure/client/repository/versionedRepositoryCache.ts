// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryLocalConflictError,
  type VersionedRepositoryConflictRecord,
  type VersionedRemoteSnapshot,
  type VersionedRepositoryCodec,
} from "../../../application/persistence/versionedRepository";

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
    committedContent: Content;
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
    identity: string;
    localContent: Content;
    remoteContent: Content;
    unitIds: string[];
  }): Promise<VersionedRepositoryLocalState<Content, Revision, LocalRevision>>;
  recordConflictRevision(input: {
    currentRemoteRevision: Revision;
    identity: string;
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
  type SyncContext = {
    baseContent: Content | null;
    conflict: VersionedRepositoryConflictRecord<Content, Revision> | null;
  };
  const states = new Map<string, State>();
  const syncContexts = new Map<string, SyncContext>();
  const requireState = (identity: string) => {
    const state = states.get(identity);

    if (!state) {
      throw new Error(`Local repository state does not exist: ${identity}`);
    }
    return state;
  };

  return {
    async completeSync({
      committedContent,
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
      syncContexts.set(identity, {
        baseContent: codec.parseContent(committedContent),
        conflict: null,
      });
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
      syncContexts.set(identity, {
        baseContent: parsedSnapshot.content,
        conflict: null,
      });
      return cloneState(state);
    },
    async load(identity) {
      const state = states.get(identity);

      return state ? cloneState(state) : null;
    },
    async loadSyncContext(identity) {
      const context = syncContexts.get(identity);

      return context ? structuredClone(context) : null;
    },
    async recordConflict({
      baseContent,
      currentRemoteRevision,
      identity,
      localContent,
      remoteContent,
      unitIds,
    }) {
      const current = requireState(identity);
      const remoteRevision = codec.parseRevision(currentRemoteRevision);
      const next = {
        ...current,
        remoteRevision,
      };

      states.set(identity, next);
      syncContexts.set(identity, {
        baseContent: codec.parseContent(baseContent),
        conflict: {
          base: codec.parseContent(baseContent),
          local: codec.parseContent(localContent),
          remote: codec.parseContent(remoteContent),
          remoteRevision,
          unitIds: [...new Set(unitIds)].sort(),
        },
      });
      return cloneState(next);
    },
    async recordConflictRevision({ currentRemoteRevision, identity }) {
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
      syncContexts.delete(identity);
    },
    async rebaseFromRemote({
      content,
      expectedLocalRevision,
      identity,
      localRevision,
      pendingChanges,
      snapshot,
    }) {
      const parsedSnapshot = codec.parseSnapshot(snapshot);
      const parsedContent = codec.parseContent(content);
      const current = requireState(identity);

      if (current.localRevision !== expectedLocalRevision) {
        throw createLocalConflictError(current.localRevision);
      }
      const state: State = {
        content: parsedContent,
        localRevision,
        pendingBaseRevision: pendingChanges ? parsedSnapshot.revision : null,
        remoteRevision: parsedSnapshot.revision,
      };

      states.set(identity, cloneState(state));
      syncContexts.set(identity, {
        baseContent: parsedSnapshot.content,
        conflict: null,
      });
      return cloneState(state);
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
      syncContexts.set(identity, {
        baseContent: parsedSnapshot.content,
        conflict: null,
      });
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
