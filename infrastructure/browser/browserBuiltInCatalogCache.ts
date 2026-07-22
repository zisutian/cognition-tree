// SPDX-License-Identifier: GPL-3.0-or-later

import { parseBuiltInCatalog } from "../../contracts/built-ins/parseBuiltIns";
import type { BuiltInCatalogCache } from "../persistence/builtInCatalogCache";
import {
  openIndexedDatabase,
  requestResult,
  transactionComplete,
} from "./indexedDbPrimitives";

export const browserBuiltInCatalogDatabaseName = "cognition-tree.built-ins";
const storeName = "catalog-v1";

export function createBrowserBuiltInCatalogCache(
  indexedDb: IDBFactory,
): BuiltInCatalogCache {
  const opened = openIndexedDatabase(
    indexedDb,
    browserBuiltInCatalogDatabaseName,
    1,
    (database) => {
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName);
      }
    }
  );

  void opened.catch(() => undefined);
  return {
    async load(identity) {
      const database = await opened;
      const transaction = database.transaction(storeName, "readonly");
      const completion = transactionComplete(transaction);
      const value = await requestResult(
        transaction.objectStore(storeName).get(identity),
      );

      await completion;
      return value === undefined ? null : parseBuiltInCatalog(value);
    },
    async save(identity, catalog) {
      const parsed = parseBuiltInCatalog(catalog);
      const database = await opened;
      const transaction = database.transaction(storeName, "readwrite");
      const completion = transactionComplete(transaction);

      transaction.objectStore(storeName).put(parsed, identity);
      await completion;
    },
  };
}
