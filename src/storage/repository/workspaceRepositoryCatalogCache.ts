import { parseRepositoryCatalog } from "../../../contracts/workspace-repository/parseCatalog";
import type { WorkspaceRepositoryDescriptor } from "./workspaceRepositoryCatalog";

export type WorkspaceRepositoryCatalogCacheState = {
  repositories: WorkspaceRepositoryDescriptor[];
  version: 1;
};

export type WorkspaceRepositoryCatalogCache = {
  load: (
    catalogIdentity: string,
  ) => Promise<WorkspaceRepositoryCatalogCacheState | null>;
  remove: (catalogIdentity: string) => Promise<void>;
  save: (
    catalogIdentity: string,
    state: WorkspaceRepositoryCatalogCacheState,
  ) => Promise<void>;
};

function readObject(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid repository catalog cache state");
  }

  return value as Record<string, unknown>;
}

export function parseWorkspaceRepositoryCatalogCacheState(
  value: unknown,
): WorkspaceRepositoryCatalogCacheState {
  const state = readObject(value);
  const fields = Object.keys(state).sort();

  if (
    fields.length !== 2 ||
    fields[0] !== "repositories" ||
    fields[1] !== "version"
  ) {
    throw new Error("Invalid repository catalog cache state");
  }
  if (state.version !== 1) {
    throw new Error("Unsupported repository catalog cache version");
  }

  return {
    repositories: parseRepositoryCatalog({
      repositories: state.repositories,
    }).repositories,
    version: 1,
  };
}

export function createMemoryWorkspaceRepositoryCatalogCache(): WorkspaceRepositoryCatalogCache {
  const states = new Map<string, WorkspaceRepositoryCatalogCacheState>();

  return {
    async load(catalogIdentity) {
      const state = states.get(catalogIdentity);

      return state ? structuredClone(state) : null;
    },
    async remove(catalogIdentity) {
      states.delete(catalogIdentity);
    },
    async save(catalogIdentity, state) {
      states.set(catalogIdentity, structuredClone(state));
    },
  };
}
