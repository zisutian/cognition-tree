// SPDX-License-Identifier: GPL-3.0-or-later

import {
  UnsupportedWireVersionError,
  WireContractError,
} from "../../contracts/common/contractValue";
import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryLocalConflictError,
  type VersionedRepositoryBackend,
  type VersionedRepositoryCodec,
  type VersionedRepositoryContentValidator,
  type VersionedRepositoryTransitionValidator,
} from "../../application/persistence/versionedRepository";
import type { VersionedRepositoryCache } from "../persistence/versionedRepositoryCache";
import { createVersionedContentRevision } from "../persistence/versionedContentRevision";
import {
  abortTransaction,
  openIndexedDatabase,
  requestResult,
  transactionComplete,
} from "./indexedDbPrimitives";

const databaseVersion = 1;
const metaStoreName = "meta-v1";
const remoteStoreName = "remote-v1";
const localStoreName = "local-v1";
const epochKey = "storage-epoch";
const remoteKey = "snapshot";

type IndexedLocalState = {
  content: unknown;
  identity: string;
  localRevision: unknown;
  pendingBaseRevision: unknown;
  remoteRevision: unknown;
};

export type BrowserVersionedContentEpochMigration<Content> = {
  fromEpoch: number;
  prepareContent(value: unknown): {
    content: Content;
    sourceRevisionContent: string;
  };
};

function openDatabase(indexedDb: IDBFactory, databaseName: string) {
  return openIndexedDatabase(
    indexedDb,
    databaseName,
    databaseVersion,
    (database) => {
      if (!database.objectStoreNames.contains(metaStoreName)) {
        database.createObjectStore(metaStoreName);
      }
      if (!database.objectStoreNames.contains(remoteStoreName)) {
        database.createObjectStore(remoteStoreName);
      }
      if (!database.objectStoreNames.contains(localStoreName)) {
        database.createObjectStore(localStoreName, { keyPath: "identity" });
      }
    },
  );
}

function isLocalRevision(value: unknown): value is `draft:${string}` {
  return typeof value === "string" && /^draft:[0-9a-f-]{36}$/i.test(value);
}

export type BrowserVersionedContentStorage<
  Content,
  Revision extends `sha256:${string}`,
> = {
  backend: VersionedRepositoryBackend<Content, Revision>;
  cache: VersionedRepositoryCache<Content, Revision, `draft:${string}`>;
  databaseName: string;
  inspect(): Promise<
    | { status: "ready" }
    | {
        code:
          | "adapter_unavailable"
          | "repository_corrupt"
          | "unsupported_repository_version";
        error: unknown;
        status: "fault";
      }
  >;
};

export function createBrowserVersionedContentStorage<
  Content,
  Revision extends `sha256:${string}`,
>({
  codec,
  createEmptyContent,
  databaseName,
  expectedEpoch,
  indexedDb,
  migration,
  serializeRevisionContent,
  validateContent,
  validateTransition,
}: {
  codec: VersionedRepositoryCodec<Content, Revision>;
  createEmptyContent(): Content;
  databaseName: string;
  expectedEpoch: number;
  indexedDb: IDBFactory;
  migration?: BrowserVersionedContentEpochMigration<Content>;
  serializeRevisionContent(content: Content): string;
  validateContent: VersionedRepositoryContentValidator<Content>;
  validateTransition: VersionedRepositoryTransitionValidator<Content>;
}): BrowserVersionedContentStorage<Content, Revision> {
  const openedDatabase = openDatabase(indexedDb, databaseName);

  void openedDatabase.catch(() => undefined);
  const createRevision = async (content: Content) =>
    codec.parseRevision(
      await createVersionedContentRevision(serializeRevisionContent(content)),
    );
  const emptySnapshot = async () => {
    const content = codec.parseContent(createEmptyContent());

    validateContent(content);
    return { content, revision: await createRevision(content) };
  };
  type StoredInitializationState = {
    epoch: unknown;
    locals: unknown[];
    remote: unknown;
  };
  const readInitializationState = async (
    database: IDBDatabase,
    mode: IDBTransactionMode = "readonly",
  ) => {
    const transaction = database.transaction(
      [metaStoreName, remoteStoreName, localStoreName],
      mode,
    );
    const completion = transactionComplete(transaction);
    const meta = transaction.objectStore(metaStoreName);
    const remote = transaction.objectStore(remoteStoreName);
    const local = transaction.objectStore(localStoreName);
    const requests = [
      requestResult(meta.get(epochKey)),
      requestResult(remote.get(remoteKey)),
      requestResult(local.getAll()),
    ] as const;
    const [epoch, remoteValue, locals] = await Promise.all(requests);

    return {
      completion,
      state: { epoch, locals, remote: remoteValue } as StoredInitializationState,
      transaction,
    };
  };
  const initializationFingerprint = (state: StoredInitializationState) =>
    JSON.stringify(state);
  const parseMigrationRemote = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new WireContractError(
        databaseName,
        "$.remote",
        "expected remote snapshot",
      );
    }
    const snapshot = value as { content?: unknown; revision?: unknown };
    const keys = Object.keys(snapshot).sort();

    if (
      keys.length !== 2 ||
      keys[0] !== "content" ||
      keys[1] !== "revision"
    ) {
      throw new WireContractError(
        databaseName,
        "$.remote",
        "unexpected remote snapshot fields",
      );
    }
    return {
      content: snapshot.content,
      revision: codec.parseRevision(snapshot.revision),
    };
  };
  const parseMigrationLocal = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new WireContractError(
        databaseName,
        "$.local",
        "expected local state",
      );
    }
    const state = value as Partial<IndexedLocalState>;

    if (
      typeof state.identity !== "string" ||
      !isLocalRevision(state.localRevision)
    ) {
      throw new WireContractError(
        databaseName,
        "$.local",
        "invalid local identity",
      );
    }
    return {
      content: state.content,
      identity: state.identity,
      localRevision: state.localRevision,
      pendingBaseRevision: state.pendingBaseRevision === null
        ? null
        : codec.parseRevision(state.pendingBaseRevision),
      remoteRevision: state.remoteRevision === null
        ? null
        : codec.parseRevision(state.remoteRevision),
    };
  };
  const createMigrationPlan = async (state: StoredInitializationState) => {
    if (!migration) {
      throw new Error(`Missing ${databaseName} storage migration`);
    }
    const remote = parseMigrationRemote(state.remote);
    const preparedRemote = migration.prepareContent(remote.content);

    validateContent(preparedRemote.content);
    const sourceRemoteRevision = codec.parseRevision(
      await createVersionedContentRevision(
        preparedRemote.sourceRevisionContent,
      ),
    );

    if (sourceRemoteRevision !== remote.revision) {
      throw new WireContractError(
        databaseName,
        "$.remote.revision",
        "revision mismatch",
      );
    }
    const remoteRevision = await createRevision(preparedRemote.content);
    const locals = state.locals.map((value, index) => {
      const local = parseMigrationLocal(value);
      const prepared = migration.prepareContent(local.content);

      validateContent(prepared.content);
      if (
        local.pendingBaseRevision === null &&
        local.remoteRevision !== sourceRemoteRevision &&
        local.remoteRevision !== remoteRevision
      ) {
        throw new WireContractError(
          databaseName,
          `$.local[${index}].remoteRevision`,
          "cannot safely map non-pending local cache",
        );
      }
      const pendingBaseRevision = local.pendingBaseRevision === null
        ? null
        : local.pendingBaseRevision === sourceRemoteRevision ||
            local.pendingBaseRevision === remoteRevision
          ? remoteRevision
          : local.pendingBaseRevision;

      return {
        content: prepared.content,
        identity: local.identity,
        localRevision: local.localRevision,
        pendingBaseRevision,
        remoteRevision,
      };
    });

    return {
      locals,
      remote: { content: preparedRemote.content, revision: remoteRevision },
    };
  };
  const validateStoredEpoch = (epoch: unknown) => {
    if (
      epoch !== undefined &&
      (!Number.isSafeInteger(epoch) || (epoch as number) < 1)
    ) {
      throw new WireContractError(
        `${databaseName} storage`,
        "$.storageEpoch",
        "invalid storage epoch",
      );
    }
    if (epoch !== undefined && (epoch as number) > expectedEpoch) {
      throw new UnsupportedWireVersionError(
        `${databaseName} storage`,
        "$.storageEpoch",
        epoch,
      );
    }
  };
  const initialize = openedDatabase.then(async (database) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const initial = await readInitializationState(database);

      await initial.completion;
      if (initial.state.epoch === expectedEpoch) return database;
      validateStoredEpoch(initial.state.epoch);
      const shouldMigrate =
        migration !== undefined &&
        initial.state.epoch === migration.fromEpoch;
      const migrationPlan = shouldMigrate
        ? await createMigrationPlan(initial.state)
        : null;
      const fallback = migrationPlan ? null : await emptySnapshot();
      const current = await readInitializationState(database, "readwrite");

      if (current.state.epoch === expectedEpoch) {
        await current.completion;
        return database;
      }
      if (
        initializationFingerprint(current.state) !==
          initializationFingerprint(initial.state)
      ) {
        await abortTransaction(current.transaction, current.completion);
        continue;
      }
      const meta = current.transaction.objectStore(metaStoreName);
      const remote = current.transaction.objectStore(remoteStoreName);
      const local = current.transaction.objectStore(localStoreName);

      if (migrationPlan) {
        remote.put(migrationPlan.remote, remoteKey);
        local.clear();
        for (const state of migrationPlan.locals) local.put(state);
      } else {
        local.clear();
        remote.put(fallback, remoteKey);
      }
      meta.put(expectedEpoch, epochKey);
      await current.completion;
      return database;
    }
    throw new Error(`${databaseName} storage changed during initialization`);
  });

  void initialize.catch(() => undefined);

  const parseLocalState = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new WireContractError(databaseName, "$.local", "expected local state");
    }
    const state = value as Partial<IndexedLocalState>;
    if (typeof state.identity !== "string" || !isLocalRevision(state.localRevision)) {
      throw new WireContractError(databaseName, "$.local", "invalid local identity");
    }
    const content = codec.parseContent(state.content);

    validateContent(content);
    return {
      content,
      localRevision: state.localRevision,
      pendingBaseRevision: state.pendingBaseRevision === null
        ? null
        : codec.parseRevision(state.pendingBaseRevision),
      remoteRevision: state.remoteRevision === null
        ? null
        : codec.parseRevision(state.remoteRevision),
    };
  };

  const readLocal = async (transaction: IDBTransaction, identity: string) => {
    const value = await requestResult(
      transaction.objectStore(localStoreName).get(identity),
    );

    return value === undefined ? null : parseLocalState(value);
  };

  const loadRemote = async () => {
    const database = await initialize;
    const transaction = database.transaction(remoteStoreName, "readonly");
    const completion = transactionComplete(transaction);
    const value = await requestResult(
      transaction.objectStore(remoteStoreName).get(remoteKey),
    );

    await completion;
    if (value === undefined) {
      throw new WireContractError(databaseName, "$.remote", "missing remote content");
    }
    const snapshot = codec.parseSnapshot(value);

    validateContent(snapshot.content);
    const canonical = await createRevision(snapshot.content);
    if (snapshot.revision !== canonical) {
      throw new WireContractError(databaseName, "$.revision", "revision mismatch");
    }
    return snapshot;
  };

  const cache: VersionedRepositoryCache<
    Content,
    Revision,
    `draft:${string}`
  > = {
    async completeSync({
      committedRemoteRevision,
      expectedLocalRevision,
      identity,
    }) {
      const database = await initialize;
      const revision = codec.parseRevision(committedRemoteRevision);
      const transaction = database.transaction(localStoreName, "readwrite");
      const completion = transactionComplete(transaction);
      const current = await readLocal(transaction, identity);

      if (!current) {
        await abortTransaction(transaction, completion);
        throw new Error(`Local content state does not exist: ${identity}`);
      }
      const next = {
        ...current,
        identity,
        pendingBaseRevision:
          current.localRevision === expectedLocalRevision ? null : revision,
        remoteRevision: revision,
      };

      transaction.objectStore(localStoreName).put(next);
      await completion;
      const { identity: _, ...result } = next;
      return structuredClone(result);
    },
    async create({ identity, localRevision, snapshot }) {
      const database = await initialize;
      const parsed = codec.parseSnapshot(snapshot);

      validateContent(parsed.content);
      const transaction = database.transaction(localStoreName, "readwrite");
      const completion = transactionComplete(transaction);
      const current = await readLocal(transaction, identity);

      if (current) {
        await abortTransaction(transaction, completion);
        throw new Error(`Local content state already exists: ${identity}`);
      }
      const state = {
        content: parsed.content,
        identity,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsed.revision,
      };

      transaction.objectStore(localStoreName).add(state);
      await completion;
      const { identity: _, ...result } = state;
      return structuredClone(result);
    },
    async load(identity) {
      const database = await initialize;
      const transaction = database.transaction(localStoreName, "readonly");
      const completion = transactionComplete(transaction);
      const state = await readLocal(transaction, identity);

      await completion;
      return state ? structuredClone(state) : null;
    },
    async recordConflict({ currentRemoteRevision, identity }) {
      const database = await initialize;
      const revision = codec.parseRevision(currentRemoteRevision);
      const transaction = database.transaction(localStoreName, "readwrite");
      const completion = transactionComplete(transaction);
      const current = await readLocal(transaction, identity);

      if (!current) {
        await abortTransaction(transaction, completion);
        throw new Error(`Local content state does not exist: ${identity}`);
      }
      const next = { ...current, identity, remoteRevision: revision };

      transaction.objectStore(localStoreName).put(next);
      await completion;
      const { identity: _, ...result } = next;
      return structuredClone(result);
    },
    async remove(identity) {
      const database = await initialize;
      const transaction = database.transaction(localStoreName, "readwrite");
      const completion = transactionComplete(transaction);

      transaction.objectStore(localStoreName).delete(identity);
      await completion;
    },
    async replaceFromRemote({
      expectedLocalRevision,
      identity,
      localRevision,
      snapshot,
    }) {
      const database = await initialize;
      const parsed = codec.parseSnapshot(snapshot);

      validateContent(parsed.content);
      const transaction = database.transaction(localStoreName, "readwrite");
      const completion = transactionComplete(transaction);
      const current = await readLocal(transaction, identity);

      if (!current) {
        await abortTransaction(transaction, completion);
        throw new Error(`Local content state does not exist: ${identity}`);
      }
      if (current.localRevision !== expectedLocalRevision) {
        await abortTransaction(transaction, completion);
        throw new VersionedRepositoryLocalConflictError(current.localRevision);
      }
      const state = {
        content: parsed.content,
        identity,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsed.revision,
      };

      transaction.objectStore(localStoreName).put(state);
      await completion;
      const { identity: _, ...result } = state;
      return structuredClone(result);
    },
    async stage({ content, expectedLocalRevision, identity, localRevision }) {
      const database = await initialize;
      const parsedContent = codec.parseContent(content);

      validateContent(parsedContent);
      const transaction = database.transaction(localStoreName, "readwrite");
      const completion = transactionComplete(transaction);
      const current = await readLocal(transaction, identity);

      if (!current) {
        await abortTransaction(transaction, completion);
        throw new Error(`Local content state does not exist: ${identity}`);
      }
      if (current.localRevision !== expectedLocalRevision) {
        await abortTransaction(transaction, completion);
        throw new VersionedRepositoryLocalConflictError(current.localRevision);
      }
      if (!current.pendingBaseRevision && !current.remoteRevision) {
        await abortTransaction(transaction, completion);
        throw new Error("Cannot stage content without a known remote base");
      }
      try {
        validateTransition(current.content, parsedContent);
      } catch (error) {
        await abortTransaction(transaction, completion);
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

      transaction.objectStore(localStoreName).put(next);
      await completion;
      const { identity: _, ...result } = next;
      return structuredClone(result);
    },
  };

  return {
    backend: {
      async commitRemoteSnapshot(commit) {
        const content = codec.parseContent(commit.content);
        const baseRevision = codec.parseRevision(commit.baseRevision);

        validateContent(content);
        const revision = await createRevision(content);
        const database = await initialize;
        const transaction = database.transaction(remoteStoreName, "readwrite");
        const completion = transactionComplete(transaction);
        const store = transaction.objectStore(remoteStoreName);
        const value = await requestResult(store.get(remoteKey));

        if (value === undefined) {
          await abortTransaction(transaction, completion);
          throw new WireContractError(databaseName, "$.remote", "missing remote content");
        }
        const current = codec.parseSnapshot(value);
        if (current.revision !== baseRevision) {
          await abortTransaction(transaction, completion);
          throw new VersionedRepositoryBackendConflictError(current.revision);
        }
        try {
          validateContent(current.content);
          validateTransition(current.content, content);
        } catch (error) {
          await abortTransaction(transaction, completion);
          throw error;
        }
        store.put({ content, revision }, remoteKey);
        await completion;
        return { revision };
      },
      loadRemoteSnapshot: loadRemote,
    },
    cache,
    databaseName,
    async inspect() {
      try {
        await loadRemote();
        return { status: "ready" };
      } catch (error) {
        return {
          code: error instanceof UnsupportedWireVersionError
            ? "unsupported_repository_version"
            : error instanceof WireContractError ||
                (error instanceof Error && error.message.includes("invalid"))
              ? "repository_corrupt"
              : "adapter_unavailable",
          error,
          status: "fault",
        };
      }
    },
  };
}
