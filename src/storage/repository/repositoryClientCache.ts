import {
  createMemoryWorkspaceRepositoryCatalogCache,
  type WorkspaceRepositoryCatalogCache,
} from "./workspaceRepositoryCatalogCache";
import {
  createMemoryWorkspaceRepositoryCache,
  type WorkspaceRepositoryCache,
} from "./workspaceRepositoryCache";

export type RepositoryClientCache = {
  catalogs: WorkspaceRepositoryCatalogCache;
  snapshots: WorkspaceRepositoryCache;
};

export function createMemoryRepositoryClientCache(): RepositoryClientCache {
  return {
    catalogs: createMemoryWorkspaceRepositoryCatalogCache(),
    snapshots: createMemoryWorkspaceRepositoryCache(),
  };
}
