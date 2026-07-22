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
  currentSystemRepositoryStorageEpochByPurpose,
  initialSystemRepositoryStorageEpochByPurpose,
  resolveSystemRepositoryStorageEpochs,
  type SystemRepositoryStorageEpochByPurpose,
} from "../../../../contracts/system-repository/storageEpoch";
import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryLocalConflictError,
} from "../../repository/versionedRepository";
import type { VersionedRepositoryCache } from "../../repository/versionedRepositoryCache";
import type {
  SystemLocalDraftRevision,
  SystemRepositoryBackend,
  SystemRepositoryContent,
  SystemRepositoryContentValidator,
  SystemRepositoryPurpose,
  SystemRepositoryRevision,
  SystemRepositoryTransitionValidator,
} from "../../repository/systemRepository";
import { SystemRepositoryValidationError } from "../../repository/systemRepository";
import { createSystemRepositoryRevision } from "../../repository/systemRepositoryRevision";
import {
  SystemRepositoryContractError,
  UnsupportedSystemRepositoryVersionError,
} from "../../../../contracts/system-repository/contractValue";

export const browserSystemRepositoryDatabaseName =
  "cognition-tree.system-repositories";
const databaseVersion = 2;
const localStateStoreName = "local-states-v1";
const remoteStateStoreName = "browser-remotes-v1";
const catalogStoreName = "catalog-v1";
const epochStoreName = "storage-epochs-v1";

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

type IndexedEpochState = {
  epoch: number;
  purpose: SystemRepositoryPurpose;
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
    if (!database.objectStoreNames.contains(epochStoreName)) {
      database.createObjectStore(epochStoreName, { keyPath: "purpose" });
    }
  });
  return requestResult(request);
}

function parseStoredEpoch(
  value: unknown,
  purpose: SystemRepositoryPurpose,
): number | null {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SystemRepositoryContractError(
      "$.storageEpoch",
      "expected an epoch record",
    );
  }
  const state = value as Partial<IndexedEpochState>;
  if (
    state.purpose !== purpose ||
    !Number.isSafeInteger(state.epoch) ||
    (state.epoch ?? 0) < 1
  ) {
    throw new SystemRepositoryContractError(
      "$.storageEpoch",
      "invalid epoch record",
    );
  }
  return state.epoch!;
}

function localStateBelongsToPurpose(
  value: unknown,
  purpose: SystemRepositoryPurpose,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<IndexedLocalState>;
  if (
    state.content &&
    typeof state.content === "object" &&
    !Array.isArray(state.content) &&
    (state.content as { purpose?: unknown }).purpose === purpose
  ) {
    return true;
  }
  return typeof state.identity === "string" &&
    (state.identity === `browser-system:${purpose}` ||
      state.identity.includes(`#system:${purpose}#`));
}

function systemRepositoryPurposeFromIdentity(
  identity: string,
): SystemRepositoryPurpose {
  for (const purpose of ["system-journal", "system-todo"] as const) {
    if (
      identity === `browser-system:${purpose}` ||
      identity.includes(`#system:${purpose}#`)
    ) {
      return purpose;
    }
  }
  throw new Error(`Invalid system repository cache identity: ${identity}`);
}

function isLocalRevision(value: unknown): value is SystemLocalDraftRevision {
  return typeof value === "string" && /^draft:[0-9a-f-]{36}$/i.test(value);
}

function parseNullableRevision(value: unknown) {
  return value === null ? null : parseSystemRepositoryRevision(value);
}

function parseLocalState(
  value: unknown,
  validateContent: SystemRepositoryContentValidator,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid IndexedDB system repository local state");
  }
  const state = value as Partial<IndexedLocalState>;

  if (typeof state.identity !== "string" || !isLocalRevision(state.localRevision)) {
    throw new Error("Invalid IndexedDB system repository local state");
  }
  const content = parseSystemRepositoryContent(state.content);

  validateContent(content);
  return {
    content,
    localRevision: state.localRevision,
    pendingBaseRevision: parseNullableRevision(state.pendingBaseRevision),
    remoteRevision: parseNullableRevision(state.remoteRevision),
  };
}

function parseRemoteState(
  value: unknown,
  purpose: SystemRepositoryPurpose,
  validateContent: SystemRepositoryContentValidator,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid IndexedDB browser system repository state");
  }
  const state = value as Partial<IndexedRemoteState>;

  if (state.purpose !== purpose) {
    throw new Error("Browser system repository purpose mismatch");
  }
  const snapshot = parseSystemRepositorySnapshot({
    content: state.content,
    revision: state.revision,
  }, purpose);

  validateContent(snapshot.content);
  return snapshot;
}

function createIndexedDbCache(
  databaseForPurpose: (
    purpose: SystemRepositoryPurpose,
  ) => Promise<IDBDatabase>,
  validateContent: SystemRepositoryContentValidator,
  validateTransition: SystemRepositoryTransitionValidator,
): SystemCache {
  const readState = async (transaction: IDBTransaction, identity: string) => {
    const value = await requestResult(
      transaction.objectStore(localStateStoreName).get(identity),
    );
    return value === undefined ? null : parseLocalState(value, validateContent);
  };

  return {
    async completeSync({
      committedRemoteRevision,
      expectedLocalRevision,
      identity,
    }) {
      const revision = parseSystemRepositoryRevision(committedRemoteRevision);
      const db = await databaseForPurpose(
        systemRepositoryPurposeFromIdentity(identity),
      );
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

      validateContent(parsed.content);
      const db = await databaseForPurpose(parsed.content.purpose);
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
      const db = await databaseForPurpose(
        systemRepositoryPurposeFromIdentity(identity),
      );
      const transaction = db.transaction(localStateStoreName, "readonly");
      const completion = transactionComplete(transaction);
      const state = await readState(transaction, identity);

      await completion;
      return state ? structuredClone(state) : null;
    },
    async recordConflict({ currentRemoteRevision, identity }) {
      const revision = parseSystemRepositoryRevision(currentRemoteRevision);
      const db = await databaseForPurpose(
        systemRepositoryPurposeFromIdentity(identity),
      );
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
      const db = await databaseForPurpose(
        systemRepositoryPurposeFromIdentity(identity),
      );
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

      validateContent(parsed.content);
      const db = await databaseForPurpose(parsed.content.purpose);
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

      validateContent(parsedContent);
      const db = await databaseForPurpose(parsedContent.purpose);
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
      try {
        validateTransition(current.content, parsedContent);
      } catch (error) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw error;
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
  validateContent: SystemRepositoryContentValidator;
  validateTransition: SystemRepositoryTransitionValidator;
};

export function createBrowserSystemRepositoryStorage(
  indexedDb: IDBFactory,
  {
    expectedEpochByPurpose = currentSystemRepositoryStorageEpochByPurpose,
    validateContent,
    validateTransition,
  }: {
    expectedEpochByPurpose?: SystemRepositoryStorageEpochByPurpose;
    validateContent: SystemRepositoryContentValidator;
    validateTransition: SystemRepositoryTransitionValidator;
  },
): BrowserSystemRepositoryStorage {
  const expectedEpochs = resolveSystemRepositoryStorageEpochs(
    expectedEpochByPurpose,
  );
  const openedDatabase = openDatabase(indexedDb);

  void openedDatabase.catch(() => undefined);
  const emptySnapshot = async (purpose: SystemRepositoryPurpose) => {
    const content = createEmptySystemRepositoryContent(purpose);

    validateContent(content);
    return {
      content,
      revision: await createSystemRepositoryRevision(content),
    };
  };
  const initializePurposeEpoch = async (
    database: IDBDatabase,
    purpose: SystemRepositoryPurpose,
  ) => {
    const expectedEpoch = expectedEpochs[purpose];
    const fallback = await emptySnapshot(purpose);
    const transaction = database.transaction(
      [
        epochStoreName,
        remoteStateStoreName,
        localStateStoreName,
        catalogStoreName,
      ],
      "readwrite",
    );
    const completion = transactionComplete(transaction);
    const epochStore = transaction.objectStore(epochStoreName);
    const storedEpoch = parseStoredEpoch(
      await requestResult(epochStore.get(purpose)),
      purpose,
    );

    if (storedEpoch === expectedEpoch) {
      await completion;
      return;
    }
    if (storedEpoch !== null && storedEpoch > expectedEpoch) {
      await completion;
      throw new UnsupportedSystemRepositoryVersionError(
        "$.storageEpoch",
        storedEpoch,
      );
    }
    if (
      storedEpoch === null &&
      expectedEpoch === initialSystemRepositoryStorageEpochByPurpose[purpose]
    ) {
      epochStore.put({ epoch: expectedEpoch, purpose });
      await completion;
      return;
    }

    const localStore = transaction.objectStore(localStateStoreName);
    const valuesRequest = localStore.getAll();
    const keysRequest = localStore.getAllKeys();
    const [values, keys] = await Promise.all([
      requestResult(valuesRequest),
      requestResult(keysRequest),
    ]);

    values.forEach((value, index) => {
      if (localStateBelongsToPurpose(value, purpose)) {
        localStore.delete(keys[index]!);
      }
    });
    transaction.objectStore(remoteStateStoreName).put({
      ...fallback,
      purpose,
    });
    transaction.objectStore(catalogStoreName).clear();
    epochStore.put({ epoch: expectedEpoch, purpose });
    await completion;
  };
  const initializedDatabaseByPurpose = new Map<
    SystemRepositoryPurpose,
    Promise<IDBDatabase>
  >();
  const databaseForPurpose = (purpose: SystemRepositoryPurpose) => {
    const existing = initializedDatabaseByPurpose.get(purpose);

    if (existing) return existing;
    const initialized = openedDatabase.then(async (database) => {
      await initializePurposeEpoch(database, purpose);
      return database;
    });

    void initialized.catch(() => undefined);
    initializedDatabaseByPurpose.set(purpose, initialized);
    return initialized;
  };

  // Start both independently. A future or corrupt epoch for one purpose must
  // not make the other purpose's repository unavailable. Catalog cache reads
  // and writes wait until both attempts settle so an older-purpose reset
  // cannot clear a freshly saved catalog in the background.
  const epochInitializationSettled = Promise.allSettled([
    databaseForPurpose("system-journal"),
    databaseForPurpose("system-todo"),
  ]).then(() => undefined);
  const loadRemote = async (purpose: SystemRepositoryPurpose) => {
    const fallback = await emptySnapshot(purpose);
    const db = await databaseForPurpose(purpose);
    const transaction = db.transaction(remoteStateStoreName, "readwrite");
    const completion = transactionComplete(transaction);
    const store = transaction.objectStore(remoteStateStoreName);
    let value = await requestResult(store.get(purpose));

    if (value === undefined) {
      value = { ...fallback, purpose };
      store.add(value);
    }
    const snapshot = parseRemoteState(value, purpose, validateContent);
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
    cache: createIndexedDbCache(
      databaseForPurpose,
      validateContent,
      validateTransition,
    ),
    catalogCache: {
      async load(identity) {
        await epochInitializationSettled;
        const db = await openedDatabase;
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

        await epochInitializationSettled;
        const db = await openedDatabase;
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

          validateContent(content);
          const baseRevision = parseSystemRepositoryRevision(commit.baseRevision);
          const revision = await createSystemRepositoryRevision(content);

          for (let attempt = 0; attempt < 3; attempt += 1) {
            const validated = await loadRemote(purpose);

            if (validated.revision !== baseRevision) {
              throw new VersionedRepositoryBackendConflictError(
                validated.revision,
              );
            }
            const db = await databaseForPurpose(purpose);
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
            const current = parseRemoteState(
              value,
              purpose,
              validateContent,
            );
            if (
              current.revision !== validated.revision ||
              JSON.stringify(current.content) !==
                JSON.stringify(validated.content)
            ) {
              transaction.abort();
              await completion.catch(() => undefined);
              continue;
            }
            try {
              validateTransition(current.content, content);
            } catch (error) {
              transaction.abort();
              await completion.catch(() => undefined);
              throw error;
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
            : error instanceof SystemRepositoryContractError ||
                error instanceof SystemRepositoryValidationError
            ? "repository_corrupt"
            : "adapter_unavailable",
          error,
          status: "fault",
        };
      }
    },
    validateContent,
    validateTransition,
  };
}
