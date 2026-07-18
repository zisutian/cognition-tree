// SPDX-License-Identifier: GPL-3.0-or-later

import { createBrowserSystemRepositoryCatalog } from "../adapters/browser/browserSystemRepository";
import { createBrowserSystemRepositoryStorage } from "../adapters/browser/browserSystemRepositoryStorage";
import { createHttpSystemRepositoryCatalog } from "../adapters/http/httpSystemRepositoryCatalog";
import type { SystemRepositoryRuntime } from "../repository/systemRepository";

export function createSystemRepositoryRuntime(): SystemRepositoryRuntime {
  if (import.meta.env.VITE_CTN_STORAGE_MODE === "browser") {
    return { catalog: createBrowserSystemRepositoryCatalog() };
  }
  const persistentStorage = globalThis.indexedDB
    ? createBrowserSystemRepositoryStorage(globalThis.indexedDB)
    : null;

  return {
    catalog: createHttpSystemRepositoryCatalog({
      baseUrl: import.meta.env.VITE_CTN_API_BASE_URL,
      cache: persistentStorage?.cache,
      catalogCache: persistentStorage?.catalogCache,
      token: import.meta.env.VITE_CTN_API_TOKEN,
    }),
  };
}
