// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseSystemRepositoryCatalog,
  parseSystemRepositoryDescriptor,
  systemRepositoryLabel,
} from "../../../../contracts/system-repository/parseCatalog";
import { parseSystemRepositoryContent } from "../../../../contracts/system-repository/parseRepository";
import { createLocalFirstVersionedRepository } from "../../repository/resilientVersionedRepository";
import {
  type SystemRepository,
  type SystemRepositoryCatalog,
  type SystemRepositoryCatalogData,
  type SystemRepositoryDescriptor,
  type SystemRepositoryIssue,
  type SystemRepositoryPurpose,
  systemRepositoryPurposes,
} from "../../repository/systemRepository";
import { createVersionedLocalDraftRevision } from "../../repository/versionedRepository";
import {
  browserSystemRepositoryDatabaseName,
  createBrowserSystemRepositoryStorage,
  type BrowserSystemRepositoryStorage,
} from "./browserSystemRepositoryStorage";

const browserSystemCatalogIdentity = "browser:system:v1";

function createDescriptor(
  purpose: SystemRepositoryPurpose,
): SystemRepositoryDescriptor {
  return {
    id: purpose,
    label: systemRepositoryLabel(purpose),
    location: {
      databaseName: browserSystemRepositoryDatabaseName,
      type: "browser",
    },
    protected: true,
  };
}

function createIssue(
  purpose: SystemRepositoryPurpose,
  code: SystemRepositoryIssue["code"],
  error: unknown,
): SystemRepositoryIssue {
  return {
    code,
    id: purpose,
    location: createDescriptor(purpose).location,
    message: error instanceof Error
      ? error.message
      : "Browser system repository is corrupt",
    status: "fault",
  };
}

export function createBrowserSystemRepositoryCatalog({
  storage: initialStorage,
}: {
  storage?: BrowserSystemRepositoryStorage;
} = {}): SystemRepositoryCatalog {
  let storage = initialStorage;
  const resolveStorage = () => {
    storage ??= createBrowserSystemRepositoryStorage(globalThis.indexedDB);
    return storage;
  };
  const repositoryByPurpose = new Map<SystemRepositoryPurpose, SystemRepository>();
  const open = (descriptor: SystemRepositoryDescriptor) => {
    const parsed = parseSystemRepositoryDescriptor(descriptor);
    if (parsed.location.type !== "browser") {
      throw new Error(`Browser system catalog cannot open ${parsed.location.type}`);
    }
    const existing = repositoryByPurpose.get(parsed.id);
    if (existing) {
      return existing;
    }
    const repository = createLocalFirstVersionedRepository({
      backend: resolveStorage().createBackend(parsed.id),
      cache: resolveStorage().cache,
      createLocalRevision: () =>
        createVersionedLocalDraftRevision<`draft:${string}`>(
          () => globalThis.crypto.randomUUID(),
        ),
      label: parsed.label,
      location: parsed.location,
      repositoryIdentity: `browser-system:${parsed.id}`,
      validateContent: (content) => {
        parseSystemRepositoryContent(content, parsed.id);
      },
    });

    repositoryByPurpose.set(parsed.id, repository);
    return repository;
  };

  return {
    label: "浏览器内置仓库",
    async listRepositories() {
      try {
        const resolvedStorage = resolveStorage();
        const results = await Promise.all(
          systemRepositoryPurposes.map(async (purpose) => ({
            purpose,
            result: await resolvedStorage.inspect(purpose),
          })),
        );
        const catalog = parseSystemRepositoryCatalog({
          issues: results.flatMap(({ purpose, result }) =>
            result.status === "fault"
              ? [createIssue(purpose, result.code, result.error)]
              : []
          ),
          repositories: results.flatMap(({ purpose, result }) =>
            result.status === "ready" ? [createDescriptor(purpose)] : []
          ),
        });

        await resolvedStorage.catalogCache.save(
          browserSystemCatalogIdentity,
          catalog,
        )
          .catch(() => undefined);
        return catalog;
      } catch (error) {
        let cached: SystemRepositoryCatalogData | null = null;
        try {
          cached = await resolveStorage().catalogCache.load(
            browserSystemCatalogIdentity,
          );
        } catch {
          // The deterministic unavailable projection below does not depend on
          // a functioning cache adapter.
        }
        if (cached) {
          return cached;
        }
        return parseSystemRepositoryCatalog({
          issues: systemRepositoryPurposes.map((purpose) => ({
            code: "adapter_unavailable",
            id: purpose,
            location: null,
            message: error instanceof Error
              ? error.message
              : "IndexedDB is unavailable",
            status: "fault",
          })),
          repositories: [],
        });
      }
    },
    openRepository: open,
    async retryRepository(purpose) {
      const result = await resolveStorage().inspect(purpose);
      return { status: result.status === "ready" ? "ready" : "fault" };
    },
  };
}
