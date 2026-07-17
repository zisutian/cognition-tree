import { parseRepositoryCatalog } from "../../../contracts/workspace-repository/parseCatalog";
import type { RepositoryCatalogDto } from "../../../contracts/workspace-repository/types";

export type WorkspaceRepositoryCatalogCacheState = RepositoryCatalogDto & {
  version: 3;
};

export type WorkspaceRepositoryCatalogCache = {
  load(identity: string): Promise<WorkspaceRepositoryCatalogCacheState | null>;
  remove(identity: string): Promise<void>;
  save(
    identity: string,
    state: WorkspaceRepositoryCatalogCacheState,
  ): Promise<void>;
};

export function parseWorkspaceRepositoryCatalogCacheState(
  value: unknown,
): WorkspaceRepositoryCatalogCacheState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid repository catalog cache state");
  }

  const record = value as Record<string, unknown>;
  const fields = Object.keys(record).sort();

  if (
    fields.join(",") !== "creatableAdapters,issues,repositories,version" ||
    record.version !== 3
  ) {
    throw new Error("Unsupported repository catalog cache version");
  }

  return {
    ...parseRepositoryCatalog({
      creatableAdapters: record.creatableAdapters,
      issues: record.issues,
      repositories: record.repositories,
    }),
    version: 3,
  };
}

export function createMemoryWorkspaceRepositoryCatalogCache(): WorkspaceRepositoryCatalogCache {
  const states = new Map<string, WorkspaceRepositoryCatalogCacheState>();

  return {
    async load(identity) {
      const state = states.get(identity);

      return state ? structuredClone(state) : null;
    },
    async remove(identity) {
      states.delete(identity);
    },
    async save(identity, state) {
      states.set(identity, structuredClone(state));
    },
  };
}
