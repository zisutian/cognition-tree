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
  deleteRepositoryAtomically(input: {
    catalogIdentity: string;
    repositoryId: string;
    repositoryIdentity: string;
  }): Promise<void>;
  snapshots: WorkspaceRepositoryCache;
};

export function createMemoryRepositoryClientCache(): RepositoryClientCache {
  const catalogs = createMemoryWorkspaceRepositoryCatalogCache();
  const snapshots = createMemoryWorkspaceRepositoryCache();

  return {
    catalogs,
    async deleteRepositoryAtomically({
      catalogIdentity,
      repositoryId,
      repositoryIdentity,
    }) {
      const catalog = await catalogs.load(catalogIdentity);

      await snapshots.remove(repositoryIdentity);
      if (!catalog) {
        return;
      }

      await catalogs.save(catalogIdentity, {
        ...catalog,
        issues: catalog.issues.filter(({ id }) => id !== repositoryId),
        repositories: catalog.repositories.filter(
          ({ id }) => id !== repositoryId,
        ),
      });
    },
    snapshots,
  };
}
