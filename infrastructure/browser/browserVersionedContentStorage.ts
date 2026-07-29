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
  type VersionedRepositoryConflictRecord,
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
  baseContent?: unknown;
  conflict?: unknown;
  content: unknown;
  identity: string;
  localRevision: unknown;
  pendingBaseRevision: unknown;
  remoteRevision: unknown;
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
  isContentValidationError,
  serializeRevisionContent,
  validateContent,
  validateTransition,
}: {
  codec: VersionedRepositoryCodec<Content, Revision>;
  createEmptyContent(): Content;
  databaseName: string;
  expectedEpoch: number;
  indexedDb: IDBFactory;
  isContentValidationError(error: unknown): boolean;
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
  const assertInitializableState = (state: StoredInitializationState) => {
    if (state.epoch !== undefined) {
      if (!Number.isSafeInteger(state.epoch) || (state.epoch as number) < 1) {
        throw new WireContractError(
          `${databaseName} storage`,
          "$.storageEpoch",
          "invalid storage epoch",
        );
      }
      throw new UnsupportedWireVersionError(
        `${databaseName} storage`,
        "$.storageEpoch",
        state.epoch,
      );
    }
    if (state.remote !== undefined || state.locals.length > 0) {
      throw new WireContractError(
        `${databaseName} storage`,
        "$",
        "partial storage state cannot be initialized",
      );
    }
  };
  const initialize = openedDatabase.then(async (database) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const initial = await readInitializationState(database);

      await initial.completion;
      if (initial.state.epoch === expectedEpoch) return database;
      assertInitializableState(initial.state);
      const initialSnapshot = await emptySnapshot();
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
      assertInitializableState(current.state);
      const meta = current.transaction.objectStore(metaStoreName);
      const remote = current.transaction.objectStore(remoteStoreName);

      remote.put(initialSnapshot, remoteKey);
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
    const pendingBaseRevision = state.pendingBaseRevision === null
      ? null
      : codec.parseRevision(state.pendingBaseRevision);
    const remoteRevision = state.remoteRevision === null
      ? null
      : codec.parseRevision(state.remoteRevision);
    const baseContent = state.baseContent === undefined
      ? pendingBaseRevision ? null : content
      : state.baseContent === null
        ? null
        : codec.parseContent(state.baseContent);
    const conflict = state.conflict === undefined || state.conflict === null
      ? null
      : (() => {
          if (
            typeof state.conflict !== "object" ||
            Array.isArray(state.conflict)
          ) {
            throw new WireContractError(
              databaseName,
              "$.local.conflict",
              "expected conflict record",
            );
          }
          const candidate = state.conflict as Partial<
            VersionedRepositoryConflictRecord<Content, Revision>
          >;

          if (
            !Array.isArray(candidate.unitIds) ||
            !candidate.unitIds.every((unitId) => typeof unitId === "string")
          ) {
            throw new WireContractError(
              databaseName,
              "$.local.conflict.unitIds",
              "expected conflict unit ids",
            );
          }
          return {
            base: codec.parseContent(candidate.base),
            local: codec.parseContent(candidate.local),
            remote: codec.parseContent(candidate.remote),
            remoteRevision: codec.parseRevision(candidate.remoteRevision),
            unitIds: [...new Set(candidate.unitIds)].sort(),
          };
        })();

    validateContent(content);
    return {
      baseContent,
      conflict,
      content,
      localRevision: state.localRevision,
      pendingBaseRevision,
      remoteRevision,
    };
  };
  const publicLocalState = (
    state: ReturnType<typeof parseLocalState>,
  ) => {
    const {
      baseContent: _baseContent,
      conflict: _conflict,
      ...result
    } = state;

    return result;
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
      committedContent,
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
        baseContent: codec.parseContent(committedContent),
        conflict: null,
      };

      transaction.objectStore(localStoreName).put(next);
      await completion;
      const { identity: _, ...result } = next;
      return structuredClone(publicLocalState(result));
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
        baseContent: parsed.content,
        conflict: null,
        content: parsed.content,
        identity,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsed.revision,
      };

      transaction.objectStore(localStoreName).add(state);
      await completion;
      const { identity: _, ...result } = state;
      return structuredClone(publicLocalState(result));
    },
    async load(identity) {
      const database = await initialize;
      const transaction = database.transaction(localStoreName, "readonly");
      const completion = transactionComplete(transaction);
      const state = await readLocal(transaction, identity);

      await completion;
      return state ? structuredClone(publicLocalState(state)) : null;
    },
    async loadSyncContext(identity) {
      const database = await initialize;
      const transaction = database.transaction(localStoreName, "readonly");
      const completion = transactionComplete(transaction);
      const state = await readLocal(transaction, identity);

      await completion;
      return state
        ? structuredClone({
            baseContent: state.baseContent,
            conflict: state.conflict,
          })
        : null;
    },
    async recordConflict({
      baseContent,
      currentRemoteRevision,
      identity,
      localContent,
      remoteContent,
      unitIds,
    }) {
      const database = await initialize;
      const revision = codec.parseRevision(currentRemoteRevision);
      const transaction = database.transaction(localStoreName, "readwrite");
      const completion = transactionComplete(transaction);
      const current = await readLocal(transaction, identity);

      if (!current) {
        await abortTransaction(transaction, completion);
        throw new Error(`Local content state does not exist: ${identity}`);
      }
      const next = {
        ...current,
        baseContent: codec.parseContent(baseContent),
        conflict: {
          base: codec.parseContent(baseContent),
          local: codec.parseContent(localContent),
          remote: codec.parseContent(remoteContent),
          remoteRevision: revision,
          unitIds: [...new Set(unitIds)].sort(),
        },
        identity,
        remoteRevision: revision,
      };

      transaction.objectStore(localStoreName).put(next);
      await completion;
      const { identity: _, ...result } = next;
      return structuredClone(publicLocalState(result));
    },
    async recordConflictRevision({ currentRemoteRevision, identity }) {
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
      return structuredClone(publicLocalState(result));
    },
    async remove(identity) {
      const database = await initialize;
      const transaction = database.transaction(localStoreName, "readwrite");
      const completion = transactionComplete(transaction);

      transaction.objectStore(localStoreName).delete(identity);
      await completion;
    },
    async rebaseFromRemote({
      content,
      expectedLocalRevision,
      identity,
      localRevision,
      pendingChanges,
      snapshot,
    }) {
      const database = await initialize;
      const parsedSnapshot = codec.parseSnapshot(snapshot);
      const parsedContent = codec.parseContent(content);

      validateContent(parsedSnapshot.content);
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
      const state = {
        baseContent: parsedSnapshot.content,
        conflict: null,
        content: parsedContent,
        identity,
        localRevision,
        pendingBaseRevision: pendingChanges ? parsedSnapshot.revision : null,
        remoteRevision: parsedSnapshot.revision,
      };

      transaction.objectStore(localStoreName).put(state);
      await completion;
      const { identity: _, ...result } = state;
      return structuredClone(publicLocalState(result));
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
        baseContent: parsed.content,
        conflict: null,
        content: parsed.content,
        identity,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsed.revision,
      };

      transaction.objectStore(localStoreName).put(state);
      await completion;
      const { identity: _, ...result } = state;
      return structuredClone(publicLocalState(result));
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
      return structuredClone(publicLocalState(result));
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
                isContentValidationError(error)
              ? "repository_corrupt"
              : "adapter_unavailable",
          error,
          status: "fault",
        };
      }
    },
  };
}
