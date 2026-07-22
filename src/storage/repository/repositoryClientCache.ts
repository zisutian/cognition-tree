import {
  createMemoryWorkspaceRepositoryCatalogCache,
  type WorkspaceRepositoryCatalogCache,
} from "./workspaceRepositoryCatalogCache";
import {
  createMemoryWorkspaceRepositoryCache,
  type WorkspaceRepositoryCache,
} from "./workspaceRepositoryCache";
import { projectWorkspaceRepositoryLabelIssues } from "./repositoryLabelPolicy";

export type RepositoryClientCache = {
  catalogs: WorkspaceRepositoryCatalogCache;
  deleteRepositoryAtomically(input: {
    catalogIdentity: string;
    repositoryId: string;
    repositoryIdentity: string;
  }): Promise<void>;
  renameRepositoryAtomically(input: {
    catalogIdentity: string;
    label: string;
    repositoryId: string;
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
        ...projectWorkspaceRepositoryLabelIssues({
          creatableAdapters: catalog.creatableAdapters,
          issues: catalog.issues.filter(({ id }) => id !== repositoryId),
          repositories: catalog.repositories.filter(
            ({ id }) => id !== repositoryId,
          ),
        }),
        version: 4,
      });
    },
    async renameRepositoryAtomically({
      catalogIdentity,
      label,
      repositoryId,
    }) {
      const catalog = await catalogs.load(catalogIdentity);

      if (!catalog) {
        throw new Error(`Repository catalog does not exist: ${catalogIdentity}`);
      }
      const descriptor = catalog.repositories.find(({ id }) =>
        id === repositoryId
      );

      if (!descriptor) {
        throw new Error(`Repository does not exist: ${repositoryId}`);
      }
      const projected = projectWorkspaceRepositoryLabelIssues({
        creatableAdapters: catalog.creatableAdapters,
        issues: catalog.issues,
        repositories: catalog.repositories.map((repository) =>
          repository.id === repositoryId
            ? { ...repository, label }
            : repository
        ),
      });

      await catalogs.save(catalogIdentity, { ...projected, version: 4 });
    },
    snapshots,
  };
}
