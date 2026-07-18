import {
  isRepositoryId,
  parseCreateRepository,
  parseRepositoryCatalog,
  parseRepositoryDeletionMode,
  parseRepositoryDeletionResult,
  parseRepositoryDescriptor,
  parseRenameRepository,
} from "../../../../contracts/workspace-repository/parseCatalog";
import { serializeJsonIteratively } from "../../../../contracts/workspace-repository/json";
import { createHttpWorkspaceRepositoryBackend } from "./httpWorkspaceRepository";
import {
  createHttpRepositoryCacheIdentity,
  requestRepositoryJson,
  type HttpRepositoryTransportOptions,
} from "./httpRepositoryTransport";
import type { WorkspaceRepositoryCatalog } from "../../repository/workspaceRepositoryCatalog";
import {
  createMemoryRepositoryClientCache,
  type RepositoryClientCache,
} from "../../repository/repositoryClientCache";
import { createLocalFirstWorkspaceRepository } from "../../repository/resilientWorkspaceRepository";
import {
  type WorkspaceRepositoryContentValidator,
  WorkspaceRepositoryRemoteError,
  WorkspaceRepositoryUnavailableError,
} from "../../repository/workspaceRepository";

type HttpWorkspaceRepositoryCatalogOptions = HttpRepositoryTransportOptions & {
  cache?: RepositoryClientCache;
  validateContent: WorkspaceRepositoryContentValidator;
};

function isOfflineError(error: unknown) {
  return (
    error instanceof WorkspaceRepositoryUnavailableError ||
    (error instanceof WorkspaceRepositoryRemoteError && error.retryable)
  );
}

function subscribeBrowserReconnect(listener: () => void) {
  if (typeof globalThis.addEventListener !== "function") {
    return () => undefined;
  }

  globalThis.addEventListener("online", listener);
  return () => globalThis.removeEventListener("online", listener);
}

export function createHttpWorkspaceRepositoryCatalog({
  baseUrl = "http://127.0.0.1:3001",
  cache = createMemoryRepositoryClientCache(),
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
  validateContent,
}: HttpWorkspaceRepositoryCatalogOptions): WorkspaceRepositoryCatalog {
  const catalogIdentity = createHttpRepositoryCacheIdentity({
    baseUrl,
    repositoryId: "__catalog__",
    token,
  });
  const saveCatalogBestEffort = async (
    catalog: Awaited<ReturnType<WorkspaceRepositoryCatalog["listRepositories"]>>,
  ) => {
    try {
      await cache.catalogs.save(await catalogIdentity, {
        ...catalog,
        version: 4,
      });
    } catch {
      // The remote catalog is authoritative; cache failure is reported only
      // when no remote response is available.
    }
  };
  const loadCatalogBestEffort = async () => {
    try {
      return await cache.catalogs.load(await catalogIdentity);
    } catch {
      return null;
    }
  };

  return {
    async createRepository(input) {
      const outbound = parseCreateRepository(input);

      validateContent(
        outbound.adapter === "local"
          ? outbound.content
          : outbound.initialContent,
      );
      const descriptor = parseRepositoryDescriptor(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          "/api/repositories",
          {
            body: serializeJsonIteratively(outbound),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
          token,
        ),
      );
      const cached = await loadCatalogBestEffort();
      const repositories = [
        ...(cached?.repositories.filter(({ id }) => id !== descriptor.id) ?? []),
        descriptor,
      ].sort((left, right) => left.id.localeCompare(right.id));

      await saveCatalogBestEffort({
        creatableAdapters: cached?.creatableAdapters ?? [],
        issues: cached?.issues.filter(({ id }) => id !== descriptor.id) ?? [],
        repositories,
      });
      return descriptor;
    },
    async deleteRepository({ id, mode }) {
      if (!isRepositoryId(id)) {
        throw new Error(`Invalid repository id: ${id}`);
      }
      const deletionMode = parseRepositoryDeletionMode(mode);
      const result = parseRepositoryDeletionResult(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          `/api/repositories/${encodeURIComponent(id)}?mode=${encodeURIComponent(deletionMode)}`,
          { method: "DELETE" },
          token,
        ),
      );

      await cache.deleteRepositoryAtomically({
        catalogIdentity: await catalogIdentity,
        repositoryId: id,
        repositoryIdentity: await createHttpRepositoryCacheIdentity({
          baseUrl,
          repositoryId: id,
          token,
        }),
      });
      return result;
    },
    label: "HTTP 后端",
    async listRepositories() {
      try {
        const previous = await loadCatalogBestEffort();
        const catalog = parseRepositoryCatalog(
          await requestRepositoryJson(
            fetchFn,
            baseUrl,
            "/api/repositories",
            undefined,
            token,
          ),
        );

        await saveCatalogBestEffort(catalog);
        const currentIds = new Set([
          ...catalog.repositories.map(({ id }) => id),
          ...catalog.issues.map(({ id }) => id),
        ]);
        const removedIds = new Set([
          ...(previous?.repositories ?? []).map(({ id }) => id),
          ...(previous?.issues ?? []).map(({ id }) => id),
        ].filter((id) => !currentIds.has(id)));

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
              // Catalog authority must not be hidden by orphan-cache cleanup.
            }
          }),
        );
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
          creatableAdapters: cached.creatableAdapters,
          issues: cached.issues,
          repositories: cached.repositories,
        };
      }
    },
    openRepository(descriptor) {
      if (descriptor.adapter === "browser") {
        throw new Error(
          `HTTP catalog cannot open browser repository: ${descriptor.id}`,
        );
      }

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
        location: descriptor.location,
        refreshRemoteOnLoad: descriptor.adapter === "local",
        repositoryIdentity: createHttpRepositoryCacheIdentity({
          baseUrl,
          repositoryId: descriptor.id,
          token,
        }),
        subscribeReconnect: subscribeBrowserReconnect,
        validateContent,
      });
    },
    async renameRepository({ id, label }) {
      if (!isRepositoryId(id)) {
        throw new Error(`Invalid repository id: ${id}`);
      }
      const outbound = parseRenameRepository({ label });
      const descriptor = parseRepositoryDescriptor(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          `/api/repositories/${encodeURIComponent(id)}`,
          {
            body: serializeJsonIteratively(outbound),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          },
          token,
        ),
      );

      try {
        await cache.renameRepositoryAtomically({
          catalogIdentity: await catalogIdentity,
          label: descriptor.label,
          repositoryId: id,
        });
      } catch {
        // The remote catalog is authoritative; an absent or unavailable local
        // projection must not turn a successful rename into a client failure.
      }
      return descriptor;
    },
  };
}
