// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseBuiltInCatalog,
  parseBuiltInId,
  parseBuiltInRetryResult,
} from "../../../contracts/built-ins/parseBuiltIns";
import {
  type BuiltInCatalog,
} from "../../../application/repository/builtInCatalog";
import {
  VersionedRepositoryRemoteError,
  VersionedRepositoryUnavailableError,
} from "../../../application/persistence/versionedRepository";
import type { BuiltInCatalogCache } from "../repository/builtInCatalogCache";
import {
  createHttpRepositoryCacheIdentity,
  requestRepositoryJson,
  type HttpRepositoryTransportOptions,
} from "./repositoryTransport";

export function createMemoryBuiltInCatalogCache(): BuiltInCatalogCache {
  const values = new Map<string, ReturnType<typeof parseBuiltInCatalog>>();

  return {
    async load(identity) {
      const value = values.get(identity);

      return value ? structuredClone(value) : null;
    },
    async save(identity, catalog) {
      values.set(identity, structuredClone(parseBuiltInCatalog(catalog)));
    },
  };
}

function isOfflineError(error: unknown) {
  return error instanceof VersionedRepositoryUnavailableError ||
    (error instanceof VersionedRepositoryRemoteError && error.retryable);
}

export function createHttpBuiltInCatalog({
  baseUrl,
  catalogCache,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpRepositoryTransportOptions & {
  catalogCache: BuiltInCatalogCache;
}): BuiltInCatalog {
  const catalogIdentity = createHttpRepositoryCacheIdentity({
    baseUrl,
    repositoryId: "__built-ins__",
    token,
  });
  return {
    label: "HTTP 内置数据",
    async listBuiltIns() {
      try {
        const catalog = parseBuiltInCatalog(
          await requestRepositoryJson(
            fetchFn,
            baseUrl,
            "/api/v1/admin/built-ins",
            undefined,
            token,
          ),
        );

        await catalogCache.save(await catalogIdentity, catalog).catch(() => undefined);
        return catalog;
      } catch (error) {
        if (!isOfflineError(error)) throw error;
        const cached = await catalogCache.load(await catalogIdentity).catch(() => null);

        if (!cached) throw error;
        return cached;
      }
    },
    async retry(value) {
      const id = parseBuiltInId(value);

      return parseBuiltInRetryResult(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          `/api/v1/admin/built-ins/${id}/retry`,
          { method: "POST" },
          token,
        ),
      );
    },
  };
}
