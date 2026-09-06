import { buildApiOperationPath } from "../../../contracts/api/registry.ts";
import {
  isRepositoryId,
  parseCreateRepository,
  parseRepositoryCatalog,
  parseRepositoryDescriptor,
  parseRenameRepository,
} from "../../../contracts/workspace/parseCatalog";
import { serializeJsonIteratively } from "../../../contracts/common/json";
import { createHttpWorkspaceRepositoryBackend } from "./workspaceRepository";
import {
  subscribeClientReconnect,
  type HttpApiTransportOptions,
} from "./apiTransport";
import { createHttpRepositoryCacheIdentity } from "./httpRepositoryIdentity";
import {
  requestWorkspaceApiJson,
  requestWorkspaceApiNoContent,
} from "./workspaceApiAdapter";
import type { WorkspaceRepositoryCatalog } from "../../../application/repository/workspaceRepositoryCatalog";
import type {
  WorkspaceRepositoryProvider,
  WorkspaceRepositoryProvisioner,
} from "../../../application/workspace/persistence/workspaceRepositoryProvider";
import {
  createMemoryRepositoryClientCache,
  type RepositoryClientCache,
} from "../repository/repositoryClientCache";
import { createLocalFirstWorkspaceRepository } from "../repository/resilientWorkspaceRepository";
import {
  type WorkspaceRepositoryPreparationPolicy,
  WorkspaceRepositoryRemoteError,
  WorkspaceRepositoryUnavailableError,
} from "../../../application/workspace/persistence/workspaceRepository";
import { parsePortableName } from "../../../core/naming/portableName.ts";

type HttpWorkspaceRepositoryCatalogOptions = HttpApiTransportOptions & {
  cache?: RepositoryClientCache;
  preparation: WorkspaceRepositoryPreparationPolicy;
};

function isOfflineError(error: unknown) {
  return (
    error instanceof WorkspaceRepositoryUnavailableError ||
    (error instanceof WorkspaceRepositoryRemoteError && error.retryable)
  );
}

export function createHttpWorkspaceRepositoryCatalog({
  baseUrl,
  cache = createMemoryRepositoryClientCache(),
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
  preparation,
}: HttpWorkspaceRepositoryCatalogOptions): WorkspaceRepositoryCatalog &
  WorkspaceRepositoryProvider & WorkspaceRepositoryProvisioner {
  const catalogIdentity = createHttpRepositoryCacheIdentity({
    baseUrl,
    repositoryId: "__catalog__",
    token,
  });
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
        await cache.catalogs.save(await catalogIdentity, {
          ...catalog,
          version: 5,
        });
      } catch {
        // The remote catalog is authoritative; cache failure is reported only
        // when no remote response is available.
      }
    });
  };
  const loadCatalogBestEffort = async () => {
    await cacheProjectionQueue;
    try {
      return await cache.catalogs.load(await catalogIdentity);
    } catch {
      return null;
    }
  };

  return {
    async createRepository(input) {
      const decoded = parseCreateRepository(input);
      const outbound = {
        ...decoded,
        label: parsePortableName(decoded.label, "Repository label"),
      };

      preparation.prepare(outbound.content);
      catalogAuthorityEpoch += 1;
      const descriptor = parseRepositoryDescriptor(
        await requestWorkspaceApiJson(
          fetchFn,
          baseUrl,
          buildApiOperationPath("listAdminRepositories"),
          {
            body: serializeJsonIteratively(outbound),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
          token,
        ),
      );
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
      if (!isRepositoryId(id)) {
        throw new Error(`Invalid repository id: ${id}`);
      }
      catalogAuthorityEpoch += 1;
      await requestWorkspaceApiNoContent(
        fetchFn,
        baseUrl,
        buildApiOperationPath("renameAdminRepository", { repositoryId: id }),
        { method: "DELETE" },
        token,
      );
      catalogAuthorityEpoch += 1;

      await enqueueCacheProjection(async () => {
        try {
          await cache.deleteRepositoryAtomically({
            catalogIdentity: await catalogIdentity,
            repositoryId: id,
            repositoryIdentity: await createHttpRepositoryCacheIdentity({
              baseUrl,
              repositoryId: id,
              token,
            }),
          });
        } catch {
          // A cache cleanup failure cannot hide a completed remote deletion.
        }
      });
    },
    label: "HTTP 后端",
    async listRepositories() {
      const authorityEpoch = catalogAuthorityEpoch;
      const listGeneration = nextListGeneration++;

      try {
        const previous = await loadCatalogBestEffort();
        const catalog = parseRepositoryCatalog(
          await requestWorkspaceApiJson(
            fetchFn,
            baseUrl,
            buildApiOperationPath("listAdminRepositories"),
            undefined,
            token,
          ),
        );

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
                  await cache.snapshots.remove(
                    await createHttpRepositoryCacheIdentity({
                      baseUrl,
                      repositoryId,
                      token,
                    }),
                  );
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
    openRepository(descriptor) {
      return createLocalFirstWorkspaceRepository({
        backend: createHttpWorkspaceRepositoryBackend({
          baseUrl,
          fetch: fetchFn,
          repositoryId: descriptor.id,
          token,
        }),
        cache: cache.snapshots,
        createDraftId: () => globalThis.crypto.randomUUID(),
        label: descriptor.label,
        loadPolicy: { mode: "refresh-remote" },
        location: descriptor.location,
        repositoryIdentity: createHttpRepositoryCacheIdentity({
          baseUrl,
          repositoryId: descriptor.id,
          token,
        }),
        subscribeReconnect: subscribeClientReconnect,
        preparation,
      });
    },
    async renameRepository({ id, label }) {
      if (!isRepositoryId(id)) {
        throw new Error(`Invalid repository id: ${id}`);
      }
      const decoded = parseRenameRepository({ label });
      const outbound = {
        label: parsePortableName(decoded.label, "Repository label"),
      };
      catalogAuthorityEpoch += 1;
      const descriptor = parseRepositoryDescriptor(
        await requestWorkspaceApiJson(
          fetchFn,
          baseUrl,
          buildApiOperationPath("renameAdminRepository", { repositoryId: id }),
          {
            body: serializeJsonIteratively(outbound),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          },
          token,
        ),
      );
      catalogAuthorityEpoch += 1;

      await enqueueCacheProjection(async () => {
        try {
          await cache.renameRepositoryAtomically({
            catalogIdentity: await catalogIdentity,
            label: descriptor.label,
            repositoryId: id,
          });
        } catch {
          // The remote catalog is authoritative; an unavailable local
          // projection cannot turn a successful rename into a client failure.
        }
      });
      return descriptor;
    },
  };
}
