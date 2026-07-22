// SPDX-License-Identifier: GPL-3.0-or-later

import { createBrowserBuiltInCatalog } from "./browser/browserBuiltInCatalog";
import { createBrowserBuiltInCatalogCache } from "./browser/browserBuiltInCatalogCache";
import {
  createBrowserJournalStorage,
  createBrowserTodoStorage,
} from "./browser/browserBuiltInRepositories";
import {
  createHttpBuiltInCatalog,
  createMemoryBuiltInCatalogCache,
} from "./http/httpBuiltInCatalog";
import type { BuiltInRuntime } from "../application/repository/builtInRepository";
import { journalRepositoryCodec } from "./persistence/journalRepository";
import { todoRepositoryCodec } from "./persistence/todoRepository";
import { createMemoryVersionedRepositoryCache } from "./persistence/versionedRepositoryCache";

export function createBuiltInRuntime(): BuiltInRuntime {
  const indexedDb = globalThis.indexedDB;
  const journalStorage = indexedDb
    ? createBrowserJournalStorage(indexedDb)
    : null;
  const todoStorage = indexedDb ? createBrowserTodoStorage(indexedDb) : null;

  if (import.meta.env.VITE_CTN_STORAGE_MODE === "browser") {
    if (!journalStorage || !todoStorage) {
      throw new Error("Browser built-in storage requires IndexedDB.");
    }
    return {
      catalog: createBrowserBuiltInCatalog({ journalStorage, todoStorage }),
    };
  }
  return {
    catalog: createHttpBuiltInCatalog({
      baseUrl: import.meta.env.VITE_CTN_API_BASE_URL,
      catalogCache: indexedDb
        ? createBrowserBuiltInCatalogCache(indexedDb)
        : createMemoryBuiltInCatalogCache(),
      journalCache: journalStorage?.cache ??
        createMemoryVersionedRepositoryCache({ codec: journalRepositoryCodec }),
      todoCache: todoStorage?.cache ??
        createMemoryVersionedRepositoryCache({ codec: todoRepositoryCodec }),
      token: import.meta.env.VITE_CTN_API_TOKEN,
    }),
  };
}
