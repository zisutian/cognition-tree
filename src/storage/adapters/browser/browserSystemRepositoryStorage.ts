// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createEmptySystemRepositoryContent,
  parseSystemRepositoryContent,
  parseSystemRepositoryRevision,
  parseSystemRepositorySnapshot,
} from "../../../../contracts/system-repository/parseRepository";
import { parseSystemRepositoryCatalog } from "../../../../contracts/system-repository/parseCatalog";
import type { SystemRepositoryCatalogDto } from "../../../../contracts/system-repository/types";
import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryLocalConflictError,
} from "../../repository/versionedRepository";
import type { VersionedRepositoryCache } from "../../repository/versionedRepositoryCache";
import type {
  SystemLocalDraftRevision,
  SystemRepositoryBackend,
  SystemRepositoryContent,
  SystemRepositoryPurpose,
  SystemRepositoryRevision,
} from "../../repository/systemRepository";
import { createSystemRepositoryRevision } from "../../repository/systemRepositoryRevision";
import {
  SystemRepositoryContractError,
  UnsupportedSystemRepositoryVersionError,
} from "../../../../contracts/system-repository/contractValue";

export const browserSystemRepositoryDatabaseName =
  "cognition-tree.system-repositories";
const databaseVersion = 1;
const localStateStoreName = "local-states-v1";
const remoteStateStoreName = "browser-remotes-v1";
const catalogStoreName = "catalog-v1";

type SystemCache = VersionedRepositoryCache<
  SystemRepositoryContent,
  SystemRepositoryRevision,
  SystemLocalDraftRevision
>;

type IndexedLocalState = {
  content: unknown;
  identity: string;
  localRevision: unknown;
  pendingBaseRevision: unknown;
  remoteRevision: unknown;
};

type IndexedRemoteState = {
  content: unknown;
  purpose: SystemRepositoryPurpose;
  revision: unknown;
};

function requestResult<Result>(request: IDBRequest<Result>) {
  return new Promise<Result>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB request failed")),
    );
  });
}

function transactionComplete(transaction: IDBTransaction) {
  const completion = new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed")),
    );
  });

  void completion.catch(() => undefined);
  return completion;
}

function openDatabase(indexedDb: IDBFactory) {
  const request = indexedDb.open(
    browserSystemRepositoryDatabaseName,
    databaseVersion,
  );

  request.addEventListener("upgradeneeded", () => {
    const database = request.result;

    if (!database.objectStoreNames.contains(localStateStoreName)) {
      database.createObjectStore(localStateStoreName, { keyPath: "identity" });
    }
    if (!database.objectStoreNames.contains(remoteStateStoreName)) {
      database.createObjectStore(remoteStateStoreName, { keyPath: "purpose" });
    }
    if (!database.objectStoreNames.contains(catalogStoreName)) {
      database.createObjectStore(catalogStoreName);
    }
  });
  return requestResult(request);
}

function isLocalRevision(value: unknown): value is SystemLocalDraftRevision {
  return typeof value === "string" && /^draft:[0-9a-f-]{36}$/i.test(value);
}

function parseNullableRevision(value: unknown) {
  return value === null ? null : parseSystemRepositoryRevision(value);
}

function parseLocalState(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid IndexedDB system repository local state");
  }
  const state = value as Partial<IndexedLocalState>;

  if (typeof state.identity !== "string" || !isLocalRevision(state.localRevision)) {
    throw new Error("Invalid IndexedDB system repository local state");
  }
  return {
    content: parseSystemRepositoryContent(state.content),
    localRevision: state.localRevision,
    pendingBaseRevision: parseNullableRevision(state.pendingBaseRevision),
    remoteRevision: parseNullableRevision(state.remoteRevision),
  };
}

function parseRemoteState(
  value: unknown,
  purpose: SystemRepositoryPurpose,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid IndexedDB browser system repository state");
  }
  const state = value as Partial<IndexedRemoteState>;

  if (state.purpose !== purpose) {
    throw new Error("Browser system repository purpose mismatch");
  }
  return parseSystemRepositorySnapshot({
    content: state.content,
    revision: state.revision,
  }, purpose);
}

function createIndexedDbCache(database: Promise<IDBDatabase>): SystemCache {
  const readState = async (transaction: IDBTransaction, identity: string) => {
    const value = await requestResult(
      transaction.objectStore(localStateStoreName).get(identity),
    );
    return value === undefined ? null : parseLocalState(value);
  };

  return {
    async completeSync({
      committedRemoteRevision,
      expectedLocalRevision,
      identity,
    }) {
      const revision = parseSystemRepositoryRevision(committedRemoteRevision);
      const db = await database;
      const transaction = db.transaction(localStateStoreName, "readwrite");
      const completion = transactionComplete(transaction);
      const state = await readState(transaction, identity);

      if (!state) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error(`Local system repository state does not exist: ${identity}`);
      }
      const next = {
        ...state,
        identity,
        pendingBaseRevision:
          state.localRevision === expectedLocalRevision ? null : revision,
        remoteRevision: revision,
      };
      transaction.objectStore(localStateStoreName).put(next);
      await completion;
      const { identity: _, ...result } = next;
      return structuredClone(result);
    },
    async create({ identity, localRevision, snapshot }) {
      const parsed = parseSystemRepositorySnapshot(snapshot);
      const db = await database;
      const transaction = db.transaction(localStateStoreName, "readwrite");
      const completion = transactionComplete(transaction);
      const existing = await readState(transaction, identity);

      if (existing) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error(`Local system repository state already exists: ${identity}`);
      }
      const state = {
        content: parsed.content,
        identity,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsed.revision,
      };
      transaction.objectStore(localStateStoreName).add(state);
      await completion;
      const { identity: _, ...result } = state;
      return structuredClone(result);
    },
    async load(identity) {
      const db = await database;
      const transaction = db.transaction(localStateStoreName, "readonly");
      const completion = transactionComplete(transaction);
      const state = await readState(transaction, identity);

      await completion;
      return state ? structuredClone(state) : null;
    },
    async recordConflict({ currentRemoteRevision, identity }) {
      const revision = parseSystemRepositoryRevision(currentRemoteRevision);
      const db = await database;
      const transaction = db.transaction(localStateStoreName, "readwrite");
      const completion = transactionComplete(transaction);
      const state = await readState(transaction, identity);

      if (!state) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error(`Local system repository state does not exist: ${identity}`);
      }
      const next = { ...state, identity, remoteRevision: revision };
      transaction.objectStore(localStateStoreName).put(next);
      await completion;
      const { identity: _, ...result } = next;
      return structuredClone(result);
    },
    async remove(identity) {
      const db = await database;
      const transaction = db.transaction(localStateStoreName, "readwrite");
      const completion = transactionComplete(transaction);

      transaction.objectStore(localStateStoreName).delete(identity);
      await completion;
    },
    async replaceFromRemote({
      expectedLocalRevision,
      identity,
      localRevision,
      snapshot,
    }) {
      const parsed = parseSystemRepositorySnapshot(snapshot);
      const db = await database;
      const transaction = db.transaction(localStateStoreName, "readwrite");
      const completion = transactionComplete(transaction);
      const current = await readState(transaction, identity);

      if (!current) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error(`Local system repository state does not exist: ${identity}`);
      }
      if (current.localRevision !== expectedLocalRevision) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new VersionedRepositoryLocalConflictError(current.localRevision);
      }
      const state = {
        content: parsed.content,
        identity,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsed.revision,
      };
      transaction.objectStore(localStateStoreName).put(state);
      await completion;
      const { identity: _, ...result } = state;
      return structuredClone(result);
    },
    async stage({ content, expectedLocalRevision, identity, localRevision }) {
      const parsedContent = parseSystemRepositoryContent(content);
      const db = await database;
      const transaction = db.transaction(localStateStoreName, "readwrite");
      const completion = transactionComplete(transaction);
      const current = await readState(transaction, identity);

      if (!current) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error(`Local system repository state does not exist: ${identity}`);
      }
      if (current.localRevision !== expectedLocalRevision) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new VersionedRepositoryLocalConflictError(current.localRevision);
      }
      if (!current.pendingBaseRevision && !current.remoteRevision) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error("Cannot stage a system repository without a remote base");
      }
      const next = {
        ...current,
        content: parsedContent,
        identity,
        localRevision,
        pendingBaseRevision:
          current.pendingBaseRevision ?? current.remoteRevision,
      };
      transaction.objectStore(localStateStoreName).put(next);
      await completion;
      const { identity: _, ...result } = next;
      return structuredClone(result);
    },
  };
}

export type BrowserSystemRepositoryStorage = {
  cache: SystemCache;
  catalogCache: {
    load(identity: string): Promise<SystemRepositoryCatalogDto | null>;
    save(
      identity: string,
      catalog: SystemRepositoryCatalogDto,
    ): Promise<void>;
  };
  createBackend(purpose: SystemRepositoryPurpose): SystemRepositoryBackend;
  inspect(purpose: SystemRepositoryPurpose): Promise<{
    code:
      | "adapter_unavailable"
      | "repository_corrupt"
      | "unsupported_repository_version";
    error: unknown;
    status: "fault";
  } | {
    status: "ready";
  }>;
};

export function createBrowserSystemRepositoryStorage(
  indexedDb: IDBFactory,
): BrowserSystemRepositoryStorage {
  const database = openDatabase(indexedDb);

  void database.catch(() => undefined);
  const emptySnapshot = async (purpose: SystemRepositoryPurpose) => {
    const content = createEmptySystemRepositoryContent(purpose);
    return {
      content,
      revision: await createSystemRepositoryRevision(content),
    };
  };
  const loadRemote = async (purpose: SystemRepositoryPurpose) => {
    const fallback = await emptySnapshot(purpose);
    const db = await database;
    const transaction = db.transaction(remoteStateStoreName, "readwrite");
    const completion = transactionComplete(transaction);
    const store = transaction.objectStore(remoteStateStoreName);
    let value = await requestResult(store.get(purpose));

    if (value === undefined) {
      value = { ...fallback, purpose };
      store.add(value);
    }
    const snapshot = parseRemoteState(value, purpose);
    await completion;
    const canonicalRevision = await createSystemRepositoryRevision(
      snapshot.content,
    );

    if (snapshot.revision !== canonicalRevision) {
      throw new SystemRepositoryContractError(
        "$.revision",
        "revision does not match canonical content",
      );
    }
    return snapshot;
  };

  return {
    cache: createIndexedDbCache(database),
    catalogCache: {
      async load(identity) {
        const db = await database;
        const transaction = db.transaction(catalogStoreName, "readonly");
        const completion = transactionComplete(transaction);
        const value = await requestResult(
          transaction.objectStore(catalogStoreName).get(identity),
        );

        await completion;
        return value === undefined ? null : parseSystemRepositoryCatalog(value);
      },
      async save(identity, catalog) {
        const parsed = parseSystemRepositoryCatalog(catalog);
        const db = await database;
        const transaction = db.transaction(catalogStoreName, "readwrite");
        const completion = transactionComplete(transaction);

        transaction.objectStore(catalogStoreName).put(parsed, identity);
        await completion;
      },
    },
    createBackend(purpose) {
      return {
        async commitRemoteSnapshot(commit) {
          const content = parseSystemRepositoryContent(commit.content, purpose);
          const baseRevision = parseSystemRepositoryRevision(commit.baseRevision);
          const revision = await createSystemRepositoryRevision(content);

          for (let attempt = 0; attempt < 3; attempt += 1) {
            const validated = await loadRemote(purpose);

            if (validated.revision !== baseRevision) {
              throw new VersionedRepositoryBackendConflictError(
                validated.revision,
              );
            }
            const db = await database;
            const transaction = db.transaction(
              remoteStateStoreName,
              "readwrite",
            );
            const completion = transactionComplete(transaction);
            const store = transaction.objectStore(remoteStateStoreName);
            const value = await requestResult(store.get(purpose));

            if (value === undefined) {
              transaction.abort();
              await completion.catch(() => undefined);
              throw new Error(
                `Browser system repository does not exist: ${purpose}`,
              );
            }
            const current = parseRemoteState(value, purpose);
            if (
              current.revision !== validated.revision ||
              JSON.stringify(current.content) !==
                JSON.stringify(validated.content)
            ) {
              transaction.abort();
              await completion.catch(() => undefined);
              continue;
            }
            store.put({ content, purpose, revision });
            await completion;
            return { revision };
          }
          throw new Error(
            `Browser system repository kept changing during commit: ${purpose}`,
          );
        },
        loadRemoteSnapshot: () => loadRemote(purpose),
      };
    },
    async inspect(purpose) {
      try {
        await loadRemote(purpose);
        return { status: "ready" };
      } catch (error) {
        return {
          code: error instanceof UnsupportedSystemRepositoryVersionError
            ? "unsupported_repository_version"
            : error instanceof SystemRepositoryContractError
            ? "repository_corrupt"
            : "adapter_unavailable",
          error,
          status: "fault",
        };
      }
    },
  };
}
