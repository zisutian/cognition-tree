import {
  parseRepositoryCatalog,
  parseRepositoryDescriptor,
} from "../../contracts/workspace-repository/parseCatalog";
import { createHttpWorkspaceRepository } from "./httpWorkspaceRepository";
import {
  requestRepositoryJson,
  type HttpRepositoryTransportOptions,
} from "./httpRepositoryTransport";
import type { WorkspaceRepositoryCatalog } from "./workspaceRepositoryCatalog";
import {
  createRuntimeRepositoryClientCache,
  type RepositoryClientCache,
} from "./browserRepositoryClientCache";
import { createResilientWorkspaceRepository } from "./resilientWorkspaceRepository";
import { WorkspaceRepositoryUnavailableError } from "./workspaceRepository";

type HttpWorkspaceRepositoryCatalogOptions = HttpRepositoryTransportOptions & {
  cache?: RepositoryClientCache;
};

function createCatalogIdentity(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  return new URL(normalizedBaseUrl).toString();
}

export function createHttpWorkspaceRepositoryCatalog({
  baseUrl = "http://127.0.0.1:3001",
  cache = createRuntimeRepositoryClientCache(),
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpWorkspaceRepositoryCatalogOptions = {}): WorkspaceRepositoryCatalog {
  const catalogIdentity = createCatalogIdentity(baseUrl);
  const saveCatalogBestEffort = async (
    repositories: Awaited<
      ReturnType<WorkspaceRepositoryCatalog["listRepositories"]>
    >,
  ) => {
    try {
      await cache.catalogs.save(catalogIdentity, {
        repositories,
        version: 1,
      });
    } catch {
      // Online catalog operations do not depend on the browser cache.
    }
  };
  const loadCatalogBestEffort = async () => {
    try {
      return await cache.catalogs.load(catalogIdentity);
    } catch {
      return null;
    }
  };

  return {
    async createRepository(input) {
      const descriptor = parseRepositoryDescriptor(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          "/api/repositories",
          {
            body: JSON.stringify(input),
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

      await saveCatalogBestEffort(repositories);
      return descriptor;
    },
    label: "HTTP 后端",
    async listRepositories() {
      try {
        const repositories = parseRepositoryCatalog(
          await requestRepositoryJson(
            fetchFn,
            baseUrl,
            "/api/repositories",
            undefined,
            token,
          ),
        ).repositories;

        await saveCatalogBestEffort(repositories);
        return repositories;
      } catch (error) {
        if (!(error instanceof WorkspaceRepositoryUnavailableError)) {
          throw error;
        }

        const cached = await loadCatalogBestEffort();

        if (!cached) {
          throw error;
        }
        return cached.repositories;
      }
    },
    openRepository(descriptor) {
      if (descriptor.adapter === "browser") {
        throw new Error(
          `HTTP catalog cannot open browser repository: ${descriptor.id}`,
        );
      }

      const repository = createHttpWorkspaceRepository({
        baseUrl,
        fetch: fetchFn,
        label: descriptor.label,
        repositoryId: descriptor.id,
        token,
      });

      return createResilientWorkspaceRepository({
        cache: cache.snapshots,
        repository,
        repositoryIdentity: `${catalogIdentity}#${descriptor.id}`,
      });
    },
  };
}
