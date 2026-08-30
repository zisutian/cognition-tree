// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryLocalConflictError,
  type VersionedRepositoryConflictRecord,
  type VersionedRemoteSnapshot,
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
  createLocalConflictError = (revision) =>
    new VersionedRepositoryLocalConflictError(revision),
}: {
  createLocalConflictError?: (revision: LocalRevision) => Error;
} = {}): VersionedRepositoryCache<Content, Revision, LocalRevision> {
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
    async create({ identity, localRevision, snapshot }) {
      if (states.has(identity)) {
        throw new Error(`Local repository state already exists: ${identity}`);
      }
      const state: State = {
        content: structuredClone(snapshot.content),
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: snapshot.revision,
      };

      states.set(identity, state);
      syncContexts.set(identity, {
        baseContent: structuredClone(snapshot.content),
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
      expectedLocalRevision,
      identity,
      localRevision,
      localContent,
      remoteContent,
      unitIds,
    }) {
      const current = requireState(identity);

      if (current.localRevision !== expectedLocalRevision) {
        throw createLocalConflictError(current.localRevision);
      }
      const normalizedUnitIds = [...new Set(unitIds)].sort();

      if (normalizedUnitIds.length === 0) {
        throw new Error("A persisted conflict requires at least one unit.");
      }
      const remoteRevision = currentRemoteRevision;
      const next = {
        ...current,
        localRevision,
        remoteRevision,
      };

      states.set(identity, next);
      syncContexts.set(identity, {
        baseContent: structuredClone(baseContent),
        conflict: {
          base: structuredClone(baseContent),
          local: structuredClone(localContent),
          remote: structuredClone(remoteContent),
          remoteRevision,
          unitIds: normalizedUnitIds,
        },
      });
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
      const current = requireState(identity);

      if (current.localRevision !== expectedLocalRevision) {
        throw createLocalConflictError(current.localRevision);
      }
      const state: State = {
        content: structuredClone(content),
        localRevision,
        pendingBaseRevision: pendingChanges ? snapshot.revision : null,
        remoteRevision: snapshot.revision,
      };

      states.set(identity, state);
      syncContexts.set(identity, {
        baseContent: structuredClone(snapshot.content),
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
      const current = requireState(identity);

      if (current.localRevision !== expectedLocalRevision) {
        throw createLocalConflictError(current.localRevision);
      }
      const state: State = {
        content: structuredClone(snapshot.content),
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: snapshot.revision,
      };

      states.set(identity, state);
      syncContexts.set(identity, {
        baseContent: structuredClone(snapshot.content),
        conflict: null,
      });
      return cloneState(state);
    },
    async stage({
      conflictUnitIds,
      content,
      expectedLocalRevision,
      identity,
      localRevision,
    }) {
      const current = requireState(identity);

      if (current.localRevision !== expectedLocalRevision) {
        throw createLocalConflictError(current.localRevision);
      }
      if (!current.pendingBaseRevision && !current.remoteRevision) {
        throw new Error("Cannot stage a repository without a known remote base.");
      }
      const next = {
        ...current,
        content: structuredClone(content),
        localRevision,
        pendingBaseRevision:
          current.pendingBaseRevision ?? current.remoteRevision,
      };
      const context = syncContexts.get(identity);

      if (context?.conflict) {
        if (conflictUnitIds === null) {
          throw new Error(
            "Conflict-aware staging requires current conflict units.",
          );
        }
        const normalizedUnitIds = [...new Set(conflictUnitIds)].sort();

        if (normalizedUnitIds.length === 0) {
          throw new Error("A persisted conflict requires at least one unit.");
        }
        syncContexts.set(identity, {
          baseContent: context.baseContent,
          conflict: {
            ...context.conflict,
            local: structuredClone(content),
            unitIds: normalizedUnitIds,
          },
        });
      } else if (conflictUnitIds !== null) {
        throw new Error(
          "Conflict units were provided without a persisted conflict.",
        );
      }

      states.set(identity, next);
      return cloneState(next);
    },
  };
}
