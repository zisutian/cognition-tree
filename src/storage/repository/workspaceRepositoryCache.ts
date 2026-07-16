import {
  parseWorkspaceRepositoryContent,
  parseWorkspaceRepositorySnapshot,
} from "../../../contracts/workspace-repository/parseRepository";
import { parseRepositoryRevision } from "../../../contracts/workspace-repository/revision";
import type {
  LocalDraftRevision,
  RemoteWorkspaceSnapshot,
  RepositoryRevision,
  WorkspaceRepositoryContent,
} from "./workspaceRepository";
import { WorkspaceRepositoryLocalConflictError } from "./workspaceRepository";

export type WorkspaceRepositoryLocalState = {
  content: WorkspaceRepositoryContent;
  localRevision: LocalDraftRevision;
  pendingBaseRevision: RepositoryRevision | null;
  remoteRevision: RepositoryRevision | null;
};

export type WorkspaceRepositoryCache = {
  completeSync(input: {
    committedRemoteRevision: RepositoryRevision;
    expectedLocalRevision: LocalDraftRevision;
    identity: string;
  }): Promise<WorkspaceRepositoryLocalState>;
  create(input: {
    identity: string;
    localRevision: LocalDraftRevision;
    snapshot: RemoteWorkspaceSnapshot;
  }): Promise<WorkspaceRepositoryLocalState>;
  load(identity: string): Promise<WorkspaceRepositoryLocalState | null>;
  recordConflict(input: {
    currentRemoteRevision: RepositoryRevision;
    identity: string;
  }): Promise<WorkspaceRepositoryLocalState>;
  remove(identity: string): Promise<void>;
  replaceFromRemote(input: {
    expectedLocalRevision: LocalDraftRevision;
    identity: string;
    localRevision: LocalDraftRevision;
    snapshot: RemoteWorkspaceSnapshot;
  }): Promise<WorkspaceRepositoryLocalState>;
  stage(input: {
    content: WorkspaceRepositoryContent;
    expectedLocalRevision: LocalDraftRevision;
    identity: string;
    localRevision: LocalDraftRevision;
  }): Promise<WorkspaceRepositoryLocalState>;
};

function cloneState(state: WorkspaceRepositoryLocalState) {
  return structuredClone(state);
}

function requireState(
  states: Map<string, WorkspaceRepositoryLocalState>,
  identity: string,
) {
  const state = states.get(identity);

  if (!state) {
    throw new Error(`Local repository state does not exist: ${identity}`);
  }

  return state;
}

export function createMemoryWorkspaceRepositoryCache(): WorkspaceRepositoryCache {
  const states = new Map<string, WorkspaceRepositoryLocalState>();

  return {
    async completeSync({
      committedRemoteRevision,
      expectedLocalRevision,
      identity,
    }) {
      const parsedRemoteRevision = parseRepositoryRevision(
        committedRemoteRevision,
      );
      const current = requireState(states, identity);
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
      const parsedSnapshot = parseWorkspaceRepositorySnapshot(snapshot);

      if (states.has(identity)) {
        throw new Error(`Local repository state already exists: ${identity}`);
      }

      const state = {
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
      const current = requireState(states, identity);
      const next = {
        ...current,
        remoteRevision: parseRepositoryRevision(currentRemoteRevision),
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
      const parsedSnapshot = parseWorkspaceRepositorySnapshot(snapshot);
      const current = requireState(states, identity);

      if (current.localRevision !== expectedLocalRevision) {
        throw new WorkspaceRepositoryLocalConflictError(current.localRevision);
      }

      const state = {
        content: parsedSnapshot.content,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsedSnapshot.revision,
      };

      states.set(identity, cloneState(state));
      return cloneState(state);
    },
    async stage({
      content,
      expectedLocalRevision,
      identity,
      localRevision,
    }) {
      const parsedContent = parseWorkspaceRepositoryContent(content);
      const current = requireState(states, identity);

      if (current.localRevision !== expectedLocalRevision) {
        throw new WorkspaceRepositoryLocalConflictError(current.localRevision);
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
