// SPDX-License-Identifier: GPL-3.0-or-later

import { parseBuiltInCatalog } from "../../contracts/built-ins/parseBuiltIns";
import type { BuiltInCatalogCache } from "../persistence/builtInCatalogCache";

export const browserBuiltInCatalogDatabaseName = "cognition-tree.built-ins";
const storeName = "catalog-v1";

function requestResult<Result>(request: IDBRequest<Result>) {
  return new Promise<Result>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB request failed"))
    );
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

export function createBrowserBuiltInCatalogCache(
  indexedDb: IDBFactory,
): BuiltInCatalogCache {
  const request = indexedDb.open(browserBuiltInCatalogDatabaseName, 1);

  request.addEventListener("upgradeneeded", () => {
    if (!request.result.objectStoreNames.contains(storeName)) {
      request.result.createObjectStore(storeName);
    }
  });
  const opened = requestResult(request);

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
