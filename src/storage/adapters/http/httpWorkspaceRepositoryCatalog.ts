import {
  parseCreateRepository,
  parseRepositoryCatalog,
  parseRepositoryDescriptor,
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
        version: 3,
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

      validateContent(outbound.content);
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
        issues: cached?.issues.filter(({ id }) => id !== descriptor.id) ?? [],
        repositories,
      });
      return descriptor;
    },
    label: "HTTP 后端",
    async listRepositories() {
      try {
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
        locationLabel: descriptor.locationLabel,
        repositoryIdentity: createHttpRepositoryCacheIdentity({
          baseUrl,
          repositoryId: descriptor.id,
          token,
        }),
        subscribeReconnect: subscribeBrowserReconnect,
        validateContent,
      });
    },
  };
}
