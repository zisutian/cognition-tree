// SPDX-License-Identifier: GPL-3.0-or-later

import { createCachedBuiltInCatalog } from "../../../application/repository/index.ts";
import type { BuiltInCatalogCache } from "../repository/index.ts";
import { createHttpBuiltInCatalogBackend, createHttpRepositoryCacheIdentity, HttpApiUnavailableError, HttpApiResponseError, type HttpApiTransportOptions } from "../http/index.ts";

export function createHttpBuiltInCatalog({ catalogCache, ...options }: HttpApiTransportOptions & { catalogCache: BuiltInCatalogCache }) {
  const identity = createHttpRepositoryCacheIdentity({ ...options, repositoryId: "__built-ins__" });
  return createCachedBuiltInCatalog({
    remote: createHttpBuiltInCatalogBackend(options),
    cache: { load: async () => catalogCache.load(await identity), save: async data => catalogCache.save(await identity, data) },
    isUnavailable: error => error instanceof HttpApiUnavailableError || (error instanceof HttpApiResponseError && error.retryable),
  });
}
