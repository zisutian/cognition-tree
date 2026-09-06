// SPDX-License-Identifier: GPL-3.0-or-later

import type { WorkspaceRepositoryCatalog, WorkspaceRepositoryCatalogData } from "../../repository/index.ts";
import type { WorkspaceRepositoryProvider, WorkspaceRepositoryProvisioner } from "./workspaceRepositoryProvider.ts";
import { WorkspaceRepositoryUnavailableError, WorkspaceRepositoryRemoteError } from "./workspaceRepository.ts";

export type WorkspaceCatalogProjectionPort = {
  load(): Promise<WorkspaceRepositoryCatalogData | null>;
  save(data: WorkspaceRepositoryCatalogData): Promise<void>;
  deleteRepository(id: string): Promise<void>;
  renameRepository(id: string, label: string): Promise<void>;
  forgetSnapshot(id: string): Promise<void>;
};
function isOfflineError(error: unknown) {
  return error instanceof WorkspaceRepositoryUnavailableError || (error instanceof WorkspaceRepositoryRemoteError && error.retryable);
}
export function createLocalFirstWorkspaceCatalog({ remote, cache, openRepository }: {
  remote: WorkspaceRepositoryCatalog & WorkspaceRepositoryProvisioner;
  cache: WorkspaceCatalogProjectionPort;
  openRepository: WorkspaceRepositoryProvider["openRepository"];
}): WorkspaceRepositoryCatalog & WorkspaceRepositoryProvider & WorkspaceRepositoryProvisioner {
  let cacheProjectionQueue: Promise<void> = Promise.resolve();
  let catalogAuthorityEpoch = 0;
  let latestAppliedListGeneration = 0;
  let nextListGeneration = 1;
  const enqueueCacheProjection = <Result>(
    operation: () => Promise<Result>,
  ) => {
    const pending = cacheProjectionQueue.then(operation);

    cacheProjectionQueue = pending.then(() => undefined, () => undefined);
    return pending;
  };
  const saveCatalogBestEffort = async (
    catalog: Awaited<ReturnType<WorkspaceRepositoryCatalog["listRepositories"]>>,
  ) => {
    await enqueueCacheProjection(async () => {
      try {
        await cache.save(catalog);
      } catch {
        // The remote catalog is authoritative; cache failure is reported only
        // when no remote response is available.
      }
    });
  };
  const loadCatalogBestEffort = async () => {
    await cacheProjectionQueue;
    try {
      return await cache.load();
    } catch {
      return null;
    }
  };

  return {
    async createRepository(input) {
      catalogAuthorityEpoch += 1;
      const descriptor = await remote.createRepository(input);
      catalogAuthorityEpoch += 1;
      const cached = await loadCatalogBestEffort();
      const repositories = [
        ...(cached?.repositories.filter(({ id }) => id !== descriptor.id) ?? []),
        descriptor,
      ].sort((left, right) => left.id.localeCompare(right.id));

      await saveCatalogBestEffort({
        issues: cached?.issues.filter(({ id }) => id !== descriptor.id) ?? [],
        repositories,
      });
      return descriptor;
    },
    async deleteRepository({ id }) {
      catalogAuthorityEpoch += 1;
      await remote.deleteRepository({ id });
      catalogAuthorityEpoch += 1;

      await enqueueCacheProjection(async () => {
        try {
          await cache.deleteRepository(id);
        } catch {
          // A cache cleanup failure cannot hide a completed remote deletion.
        }
      });
    },
    label: remote.label,
    async listRepositories() {
      const authorityEpoch = catalogAuthorityEpoch;
      const listGeneration = nextListGeneration++;

      try {
        const previous = await loadCatalogBestEffort();
        const catalog = await remote.listRepositories();

        if (
          authorityEpoch === catalogAuthorityEpoch &&
          listGeneration > latestAppliedListGeneration
        ) {
          latestAppliedListGeneration = listGeneration;
          await saveCatalogBestEffort(catalog);
          const currentIds = new Set([
            ...catalog.repositories.map(({ id }) => id),
            ...catalog.issues.map(({ id }) => id),
          ]);
          const removedIds = new Set([
            ...(previous?.repositories ?? []).map(({ id }) => id),
            ...(previous?.issues ?? []).map(({ id }) => id),
          ].filter((id) => !currentIds.has(id)));

          await enqueueCacheProjection(async () => {
            await Promise.all(
              [...removedIds].map(async (repositoryId) => {
                try {
                  await cache.forgetSnapshot(repositoryId);
                } catch {
                  // Catalog authority must not be hidden by orphan cleanup.
                }
              }),
            );
          });
        }
        return catalog;
      } catch (error) {
        if (!isOfflineError(error)) {
          throw error;
        }

        const cached = await loadCatalogBestEffort();

        if (!cached) {
          throw error;
        }

        return {
          issues: cached.issues,
          repositories: cached.repositories,
        };
      }
    },
    openRepository,
    async renameRepository({ id, label }) {
      catalogAuthorityEpoch += 1;
      const descriptor = await remote.renameRepository({ id, label });
      catalogAuthorityEpoch += 1;

      await enqueueCacheProjection(async () => {
        try {
          await cache.renameRepository(descriptor.id, descriptor.label);
        } catch {
          // The remote catalog is authoritative; an unavailable local
          // projection cannot turn a successful rename into a client failure.
        }
      });
      return descriptor;
    },
  };
}
