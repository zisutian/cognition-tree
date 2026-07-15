import {
  parseWorkspaceRepositoryContent,
  parseWorkspaceRepositorySnapshot,
} from "../../../contracts/workspace-repository/parseRepository";
import type {
  WorkspaceRepositoryContent,
} from "./workspaceRepository";

export type ConfirmedWorkspaceRepositorySnapshot =
  WorkspaceRepositoryContent & {
    repositoryPath: string;
    revision: string;
  };

export type PendingWorkspaceRepositoryCommit = {
  baseRevision: string;
  content: WorkspaceRepositoryContent;
  localRevision: string;
  repositoryPath: string;
};

export type WorkspaceRepositoryCacheState = {
  confirmed: ConfirmedWorkspaceRepositorySnapshot | null;
  pending: PendingWorkspaceRepositoryCommit | null;
  version: 1;
};

export type WorkspaceRepositoryCache = {
  load: (
    repositoryIdentity: string,
  ) => Promise<WorkspaceRepositoryCacheState | null>;
  remove: (repositoryIdentity: string) => Promise<void>;
  save: (
    repositoryIdentity: string,
    state: WorkspaceRepositoryCacheState,
  ) => Promise<void>;
};

function readObject(value: unknown, label: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid repository cache ${label}`);
  }

  return value as Record<string, unknown>;
}

function assertFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  label: string,
) {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();

  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    throw new Error(`Invalid repository cache ${label}`);
  }
}

export function parseWorkspaceRepositoryCacheState(
  value: unknown,
): WorkspaceRepositoryCacheState {
  const state = readObject(value, "state");

  assertFields(state, ["confirmed", "pending", "version"], "state");
  if (state.version !== 1) {
    throw new Error("Unsupported repository cache version");
  }

  const confirmed = state.confirmed === null
    ? null
    : parseWorkspaceRepositorySnapshot(state.confirmed);
  let pending: PendingWorkspaceRepositoryCommit | null = null;

  if (state.pending !== null) {
    const pendingValue = readObject(state.pending, "pending commit");

    assertFields(
      pendingValue,
      ["baseRevision", "content", "localRevision", "repositoryPath"],
      "pending commit",
    );
    if (
      typeof pendingValue.baseRevision !== "string" ||
      pendingValue.baseRevision.length === 0 ||
      typeof pendingValue.localRevision !== "string" ||
      pendingValue.localRevision.length === 0 ||
      typeof pendingValue.repositoryPath !== "string" ||
      pendingValue.repositoryPath.length === 0
    ) {
      throw new Error("Invalid repository cache pending commit");
    }

    pending = {
      baseRevision: pendingValue.baseRevision,
      content: parseWorkspaceRepositoryContent(pendingValue.content),
      localRevision: pendingValue.localRevision,
      repositoryPath: pendingValue.repositoryPath,
    };
  }

  return { confirmed, pending, version: 1 };
}

export function createMemoryWorkspaceRepositoryCache(): WorkspaceRepositoryCache {
  const states = new Map<string, WorkspaceRepositoryCacheState>();

  return {
    async load(repositoryIdentity) {
      const state = states.get(repositoryIdentity);

      return state ? structuredClone(state) : null;
    },
    async remove(repositoryIdentity) {
      states.delete(repositoryIdentity);
    },
    async save(repositoryIdentity, state) {
      states.set(repositoryIdentity, structuredClone(state));
    },
  };
}
