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
} from "../../application/repository/versionedRepository";
import type { VersionedRepositoryCache } from "../persistence/versionedRepositoryCache";
import { createVersionedContentRevision } from "../persistence/versionedContentRevision";

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

function requestResult<Result>(request: IDBRequest<Result>) {
  return new Promise<Result>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB request failed"))
    );
  });
}

function transactionComplete(transaction: IDBTransaction) {
  const completion = new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"))
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"))
    );
  });

  void completion.catch(() => undefined);
  return completion;
}

function openDatabase(indexedDb: IDBFactory, databaseName: string) {
  const request = indexedDb.open(databaseName, databaseVersion);

  request.addEventListener("upgradeneeded", () => {
    const database = request.result;

    if (!database.objectStoreNames.contains(metaStoreName)) {
      database.createObjectStore(metaStoreName);
    }
    if (!database.objectStoreNames.contains(remoteStoreName)) {
      database.createObjectStore(remoteStoreName);
    }
    if (!database.objectStoreNames.contains(localStoreName)) {
      database.createObjectStore(localStoreName, { keyPath: "identity" });
    }
  });
  return requestResult(request);
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
  clearPreviousData = async () => undefined,
  codec,
  createEmptyContent,
  databaseName,
  expectedEpoch,
  indexedDb,
  serializeRevisionContent,
  validateContent,
  validateTransition,
}: {
  clearPreviousData?: () => Promise<void>;
  codec: VersionedRepositoryCodec<Content, Revision>;
  createEmptyContent(): Content;
  databaseName: string;
  expectedEpoch: number;
  indexedDb: IDBFactory;
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
  const initialize = openedDatabase.then(async (database) => {
    const initialTransaction = database.transaction(metaStoreName, "readonly");
    const initialCompletion = transactionComplete(initialTransaction);
    const initialEpoch = await requestResult(
      initialTransaction.objectStore(metaStoreName).get(epochKey),
    );

    await initialCompletion;
    if (initialEpoch === expectedEpoch) return database;
    if (
      initialEpoch !== undefined &&
      (!Number.isSafeInteger(initialEpoch) || (initialEpoch as number) < 1)
    ) {
      throw new WireContractError(
        `${databaseName} storage`,
        "$.storageEpoch",
        "invalid storage epoch",
      );
    }
    if ((initialEpoch as number | undefined) !== undefined &&
        (initialEpoch as number) > expectedEpoch) {
      throw new UnsupportedWireVersionError(
        `${databaseName} storage`,
        "$.storageEpoch",
        initialEpoch,
      );
    }
    await clearPreviousData();
    const fallback = await emptySnapshot();
    const transaction = database.transaction(
      [metaStoreName, remoteStoreName, localStoreName],
      "readwrite",
    );
    const completion = transactionComplete(transaction);
    const meta = transaction.objectStore(metaStoreName);
    const currentEpoch = await requestResult(meta.get(epochKey));

    if (currentEpoch === expectedEpoch) {
      await completion;
      return database;
    }
    transaction.objectStore(localStoreName).clear();
    transaction.objectStore(remoteStoreName).put(fallback, remoteKey);
    meta.put(expectedEpoch, epochKey);
    await completion;
    return database;
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
        transaction.abort();
        await completion.catch(() => undefined);
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
        transaction.abort();
        await completion.catch(() => undefined);
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
        transaction.abort();
        await completion.catch(() => undefined);
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
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error(`Local content state does not exist: ${identity}`);
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
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error(`Local content state does not exist: ${identity}`);
      }
      if (current.localRevision !== expectedLocalRevision) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new VersionedRepositoryLocalConflictError(current.localRevision);
      }
      if (!current.pendingBaseRevision && !current.remoteRevision) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error("Cannot stage content without a known remote base");
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
          transaction.abort();
          await completion.catch(() => undefined);
          throw new WireContractError(databaseName, "$.remote", "missing remote content");
        }
        const current = codec.parseSnapshot(value);
        if (current.revision !== baseRevision) {
          transaction.abort();
          await completion.catch(() => undefined);
          throw new VersionedRepositoryBackendConflictError(current.revision);
        }
        try {
          validateContent(current.content);
          validateTransition(current.content, content);
        } catch (error) {
          transaction.abort();
          await completion.catch(() => undefined);
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
