// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseSystemRepositoryCatalog,
  parseSystemRepositoryDescriptor,
  parseSystemRepositoryRetryResult,
} from "../../../../contracts/system-repository/parseCatalog";
import {
  parseSystemRepositoryContent,
  parseSystemRepositoryRevision,
  parseSystemRepositorySnapshot,
  parseSystemRepositoryPurpose,
} from "../../../../contracts/system-repository/parseRepository";
import { createLocalFirstVersionedRepository } from "../../repository/resilientVersionedRepository";
import {
  type SystemRepository,
  type SystemRepositoryCatalog,
  type SystemRepositoryCatalogData,
  type SystemRepositoryContentValidator,
  type SystemRepositoryPurpose,
  type SystemRepositoryTransitionValidator,
} from "../../repository/systemRepository";
import {
  createMemoryVersionedRepositoryCache,
  type VersionedRepositoryCache,
} from "../../repository/versionedRepositoryCache";
import {
  createVersionedLocalDraftRevision,
  VersionedRepositoryRemoteError,
  VersionedRepositoryUnavailableError,
} from "../../repository/versionedRepository";
import type {
  SystemLocalDraftRevision,
  SystemRepositoryContent,
  SystemRepositoryRevision,
} from "../../repository/systemRepository";
import { createHttpSystemRepositoryBackend } from "./httpSystemRepository";
import {
  createHttpRepositoryCacheIdentity,
  requestRepositoryJson,
  type HttpRepositoryTransportOptions,
} from "./httpRepositoryTransport";

type SystemCache = VersionedRepositoryCache<
  SystemRepositoryContent,
  SystemRepositoryRevision,
  SystemLocalDraftRevision
>;

export type SystemRepositoryCatalogCache = {
  load(identity: string): Promise<SystemRepositoryCatalogData | null>;
  save(identity: string, catalog: SystemRepositoryCatalogData): Promise<void>;
};

function createMemoryCatalogCache(): SystemRepositoryCatalogCache {
  let catalog: {
    identity: string;
    value: SystemRepositoryCatalogData;
  } | null = null;
  return {
    async load(identity) {
      const cached = catalog?.identity === identity ? catalog.value : null;

      return cached ? structuredClone(cached) : null;
    },
    async save(identity, next) {
      catalog = {
        identity,
        value: structuredClone(parseSystemRepositoryCatalog(next)),
      };
    },
  };
}

function createMemorySystemCache(
  validateContent: SystemRepositoryContentValidator,
): SystemCache {
  return createMemoryVersionedRepositoryCache({
    codec: {
      parseContent(value) {
        const content = parseSystemRepositoryContent(value);

        validateContent(content);
        return content;
      },
      parseRevision: parseSystemRepositoryRevision,
      parseSnapshot(value) {
        const snapshot = parseSystemRepositorySnapshot(value);

        validateContent(snapshot.content);
        return snapshot;
      },
    },
  });
}

function isOfflineError(error: unknown) {
  return error instanceof VersionedRepositoryUnavailableError ||
    (error instanceof VersionedRepositoryRemoteError && error.retryable);
}

function subscribeBrowserReconnect(listener: () => void) {
  if (typeof globalThis.addEventListener !== "function") {
    return () => undefined;
  }
  globalThis.addEventListener("online", listener);
  return () => globalThis.removeEventListener("online", listener);
}

export function createHttpSystemRepositoryCatalog({
  baseUrl = "http://127.0.0.1:3001",
  cache: providedCache,
  catalogCache = createMemoryCatalogCache(),
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
  validateContent,
  validateTransition,
}: HttpRepositoryTransportOptions & {
  cache?: SystemCache;
  catalogCache?: SystemRepositoryCatalogCache;
  validateContent: SystemRepositoryContentValidator;
  validateTransition: SystemRepositoryTransitionValidator;
}): SystemRepositoryCatalog {
  const cache = providedCache ?? createMemorySystemCache(validateContent);
  const repositoryByPurpose = new Map<SystemRepositoryPurpose, SystemRepository>();
  const catalogIdentity = createHttpRepositoryCacheIdentity({
    baseUrl,
    repositoryId: "__system-catalog__",
    token,
  });

  return {
    label: "HTTP 内置仓库",
    async listRepositories() {
      try {
        const catalog = parseSystemRepositoryCatalog(
          await requestRepositoryJson(
            fetchFn,
            baseUrl,
            "/api/system-repositories",
            undefined,
            token,
          ),
        );
        await catalogCache.save(await catalogIdentity, catalog).catch(() =>
          undefined
        );
        return catalog;
      } catch (error) {
        if (!isOfflineError(error)) {
          throw error;
        }
        const cached = await catalogCache.load(await catalogIdentity).catch(() =>
          null
        );
        if (!cached) {
          throw error;
        }
        return cached;
      }
    },
    openRepository(descriptor) {
      const parsed = parseSystemRepositoryDescriptor(descriptor);
      if (parsed.location.type !== "server") {
        throw new Error(`HTTP system catalog cannot open ${parsed.location.type}`);
      }
      const existing = repositoryByPurpose.get(parsed.id);
      if (existing) {
        return existing;
      }
      const validateRepositoryContent: SystemRepositoryContentValidator = (
        content,
      ) => {
        const parsedContent = parseSystemRepositoryContent(content, parsed.id);

        validateContent(parsedContent);
      };
      const validateRepositoryTransition: SystemRepositoryTransitionValidator = (
        previous,
        next,
      ) => {
        const previousContent = parseSystemRepositoryContent(
          previous,
          parsed.id,
        );
        const nextContent = parseSystemRepositoryContent(next, parsed.id);

        validateTransition(previousContent, nextContent);
      };
      const repository = createLocalFirstVersionedRepository({
        backend: createHttpSystemRepositoryBackend({
          baseUrl,
          fetch: fetchFn,
          purpose: parsed.id,
          token,
          validateContent: validateRepositoryContent,
          validateTransition: validateRepositoryTransition,
        }),
        cache,
        createLocalRevision: () =>
          createVersionedLocalDraftRevision<`draft:${string}`>(
            () => globalThis.crypto.randomUUID(),
          ),
        label: parsed.label,
        location: parsed.location,
        refreshRemoteOnLoad: true,
        repositoryIdentity: createHttpRepositoryCacheIdentity({
          baseUrl,
          repositoryId: `system:${parsed.id}`,
          token,
        }),
        subscribeReconnect: subscribeBrowserReconnect,
        validateContent: validateRepositoryContent,
        validateTransition: validateRepositoryTransition,
      });

      repositoryByPurpose.set(parsed.id, repository);
      return repository;
    },
    async retryRepository(purpose) {
      const parsedPurpose = parseSystemRepositoryPurpose(purpose);
      return parseSystemRepositoryRetryResult(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          `/api/system-repositories/${encodeURIComponent(parsedPurpose)}/retry`,
          { method: "POST" },
          token,
        ),
      );
    },
  };
}
