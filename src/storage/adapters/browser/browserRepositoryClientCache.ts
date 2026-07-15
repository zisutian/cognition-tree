import {
  parseWorkspaceRepositoryCatalogCacheState,
} from "../../repository/workspaceRepositoryCatalogCache";
import {
  parseWorkspaceRepositoryCacheState,
} from "../../repository/workspaceRepositoryCache";
import {
  createMemoryRepositoryClientCache,
  type RepositoryClientCache,
} from "../../repository/repositoryClientCache";

const databaseName = "cognition-tree.repository-cache";
const databaseVersion = 2;
const catalogStoreName = "repository-catalogs";
const snapshotStoreName = "repository-states";

function requestResult<Result>(request: IDBRequest<Result>) {
  return new Promise<Result>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB request failed")),
    );
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed")),
    );
  });
}

function openDatabase(indexedDb: IDBFactory) {
  const request = indexedDb.open(databaseName, databaseVersion);

  request.addEventListener("upgradeneeded", () => {
    if (!request.result.objectStoreNames.contains(catalogStoreName)) {
      request.result.createObjectStore(catalogStoreName);
    }
    if (!request.result.objectStoreNames.contains(snapshotStoreName)) {
      request.result.createObjectStore(snapshotStoreName);
    }
  });
  return requestResult(request);
}

function createIndexedDbCache<Value>({
  database,
  parse,
  storeName,
}: {
  database: Promise<IDBDatabase>;
  parse: (value: unknown) => Value;
  storeName: string;
}) {
  return {
    async load(identity: string) {
      const db = await database;
      const transaction = db.transaction(storeName, "readonly");
      const completion = transactionComplete(transaction);
      const value = await requestResult(
        transaction.objectStore(storeName).get(identity),
      );

      await completion;
      if (value === undefined) {
        return null;
      }

      try {
        return parse(value);
      } catch {
        const cleanup = db.transaction(storeName, "readwrite");
        const cleanupCompletion = transactionComplete(cleanup);

        cleanup.objectStore(storeName).delete(identity);
        await cleanupCompletion;
        return null;
      }
    },
    async remove(identity: string) {
      const db = await database;
      const transaction = db.transaction(storeName, "readwrite");
      const completion = transactionComplete(transaction);

      transaction.objectStore(storeName).delete(identity);
      await completion;
    },
    async save(identity: string, value: Value) {
      const db = await database;
      const transaction = db.transaction(storeName, "readwrite");
      const completion = transactionComplete(transaction);

      transaction.objectStore(storeName).put(value, identity);
      await completion;
    },
  };
}

export function createIndexedDbRepositoryClientCache(
  indexedDb: IDBFactory,
): RepositoryClientCache {
  const database = openDatabase(indexedDb);

  return {
    catalogs: createIndexedDbCache({
      database,
      parse: parseWorkspaceRepositoryCatalogCacheState,
      storeName: catalogStoreName,
    }),
    snapshots: createIndexedDbCache({
      database,
      parse: parseWorkspaceRepositoryCacheState,
      storeName: snapshotStoreName,
    }),
  };
}

export function createBrowserRepositoryClientCache() {
  return globalThis.indexedDB
    ? createIndexedDbRepositoryClientCache(globalThis.indexedDB)
    : createMemoryRepositoryClientCache();
}
