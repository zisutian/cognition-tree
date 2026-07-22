// SPDX-License-Identifier: GPL-3.0-or-later

import {
  currentSystemRepositoryStorageEpochByPurpose,
  type SystemRepositoryStorageEpochByPurpose,
} from "../../../contracts/system-repository/storageEpoch";
import { createBrowserSystemRepositoryCatalog } from "../adapters/browser/browserSystemRepository";
import { createBrowserSystemRepositoryStorage } from "../adapters/browser/browserSystemRepositoryStorage";
import { createHttpSystemRepositoryCatalog } from "../adapters/http/httpSystemRepositoryCatalog";
import type { SystemRepositoryRuntime } from "../repository/systemRepository";
import {
  validateSystemRepositoryContent,
  validateSystemRepositoryTransition,
} from "../repository/systemRepository";

export function createSystemRepositoryRuntime(
  expectedEpochByPurpose: SystemRepositoryStorageEpochByPurpose =
    currentSystemRepositoryStorageEpochByPurpose,
): SystemRepositoryRuntime {
  if (import.meta.env.VITE_CTN_STORAGE_MODE === "browser") {
    return {
      catalog: createBrowserSystemRepositoryCatalog({
        expectedEpochByPurpose,
        validateContent: validateSystemRepositoryContent,
        validateTransition: validateSystemRepositoryTransition,
      }),
    };
  }
  const persistentStorage = globalThis.indexedDB
    ? createBrowserSystemRepositoryStorage(globalThis.indexedDB, {
        expectedEpochByPurpose,
        validateContent: validateSystemRepositoryContent,
        validateTransition: validateSystemRepositoryTransition,
      })
    : null;

  return {
    catalog: createHttpSystemRepositoryCatalog({
      baseUrl: import.meta.env.VITE_CTN_API_BASE_URL,
      cache: persistentStorage?.cache,
      catalogCache: persistentStorage?.catalogCache,
      token: import.meta.env.VITE_CTN_API_TOKEN,
      validateContent: validateSystemRepositoryContent,
      validateTransition: validateSystemRepositoryTransition,
    }),
  };
}
