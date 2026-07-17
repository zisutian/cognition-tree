import { parseRepositoryDescriptor } from "../../../../contracts/workspace-repository/parseCatalog";
import {
  parseWorkspaceRepositoryContent,
  parseWorkspaceRepositorySnapshot,
} from "../../../../contracts/workspace-repository/parseRepository";
import { parseRepositoryRevision } from "../../../../contracts/workspace-repository/revision";
import type {
  LocalDraftRevisionDto,
  RepositoryRevisionDto,
  WorkspaceRepositoryContentDto,
  RepositoryDescriptorDto,
} from "../../../../contracts/workspace-repository/types";
import type { RepositoryClientCache } from "../../repository/repositoryClientCache";
import type {
  WorkspaceRepositoryCache,
  WorkspaceRepositoryLocalState,
} from "../../repository/workspaceRepositoryCache";
import { WorkspaceRepositoryLocalConflictError } from "../../repository/workspaceRepository";
import {
  parseWorkspaceRepositoryCatalogCacheState,
  type WorkspaceRepositoryCatalogCache,
} from "../../repository/workspaceRepositoryCatalogCache";

const databaseName = "cognition-tree.repository-cache";
const databaseVersion = 3;
const catalogStoreName = "repository-catalogs-v3";
const stateStoreName = "repository-states-v3";
const noteStoreName = "repository-notes-v3";
const noteIdentityIndexName = "by-repository-identity";

export type BrowserRepositoryClientCache = RepositoryClientCache & {
  createRepositoryAtomically(input: {
    catalogIdentity: string;
    content: WorkspaceRepositoryContentDto;
    descriptor: RepositoryDescriptorDto;
    localRevision: LocalDraftRevisionDto;
    remoteRevision: RepositoryRevisionDto;
    repositoryIdentity: string;
  }): Promise<void>;
};

type IndexedRepositoryState = {
  identity: string;
  localRevision: LocalDraftRevisionDto;
  noteIds: string[];
  pendingBaseRevision: RepositoryRevisionDto | null;
  remoteRevision: RepositoryRevisionDto | null;
  schemaVersion: 3;
  syntaxSource: string | null;
  workspace: Pick<WorkspaceRepositoryContentDto["workspace"], "id" | "name" | "tree">;
};

type IndexedRepositoryNote = {
  id: string;
  identity: string;
  source: string;
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

  // A request can fail before its surrounding operation reaches the final
  // `await completion`. Observe the transaction immediately so an abort never
  // escapes as an unhandled rejection; callers still await the original
  // promise and receive the same failure.
  void completion.catch(() => undefined);
  return completion;
}

function openDatabase(indexedDb: IDBFactory) {
  const request = indexedDb.open(databaseName, databaseVersion);

  request.addEventListener("upgradeneeded", () => {
    const database = request.result;

    for (const storeName of [...database.objectStoreNames]) {
      database.deleteObjectStore(storeName);
    }

    database.createObjectStore(catalogStoreName);
    database.createObjectStore(stateStoreName, { keyPath: "identity" });
    const noteStore = database.createObjectStore(noteStoreName, {
      keyPath: ["identity", "id"],
    });

    noteStore.createIndex(noteIdentityIndexName, "identity", { unique: false });
  });

  return requestResult(request);
}

function isLocalRevision(value: unknown): value is LocalDraftRevisionDto {
  return typeof value === "string" && /^draft:[0-9a-f-]{36}$/i.test(value);
}

function isRemoteRevision(value: unknown): value is RepositoryRevisionDto {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function parseIndexedState(value: unknown): IndexedRepositoryState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid IndexedDB repository state");
  }

  const state = value as Partial<IndexedRepositoryState>;

  if (
    typeof state.identity !== "string" ||
    !isLocalRevision(state.localRevision) ||
    !Array.isArray(state.noteIds) ||
    !state.noteIds.every((id) => typeof id === "string") ||
    (state.pendingBaseRevision !== null &&
      !isRemoteRevision(state.pendingBaseRevision)) ||
    (state.remoteRevision !== null && !isRemoteRevision(state.remoteRevision)) ||
    state.schemaVersion !== 3 ||
    (state.syntaxSource !== null && typeof state.syntaxSource !== "string") ||
    !state.workspace ||
    typeof state.workspace !== "object"
  ) {
    throw new Error("Invalid IndexedDB repository state");
  }

  return state as IndexedRepositoryState;
}

function toIndexedState(
  identity: string,
  state: Omit<WorkspaceRepositoryLocalState, "content"> & {
    content: WorkspaceRepositoryContentDto;
  },
): IndexedRepositoryState {
  return {
    identity,
    localRevision: state.localRevision,
    noteIds: state.content.workspace.notes.map((note) => note.id),
    pendingBaseRevision: state.pendingBaseRevision,
    remoteRevision: state.remoteRevision,
    schemaVersion: 3,
    syntaxSource: state.content.syntaxSource,
    workspace: {
      id: state.content.workspace.id,
      name: state.content.workspace.name,
      tree: state.content.workspace.tree,
    },
  };
}

function toLocalState(
  state: IndexedRepositoryState,
  notes: IndexedRepositoryNote[],
): WorkspaceRepositoryLocalState {
  const noteById = new Map(notes.map((note) => [note.id, note]));
  const content = parseWorkspaceRepositoryContent({
    schemaVersion: 3,
    syntaxSource: state.syntaxSource,
    workspace: {
      ...state.workspace,
      notes: state.noteIds.map((id) => {
        const note = noteById.get(id);

        if (!note) {
          throw new Error(`IndexedDB repository note is missing: ${id}`);
        }

        return { id: note.id, source: note.source };
      }),
    },
  });

  return {
    content,
    localRevision: state.localRevision,
    pendingBaseRevision: state.pendingBaseRevision,
    remoteRevision: state.remoteRevision,
  };
}

async function readNotes(
  transaction: IDBTransaction,
  identity: string,
): Promise<IndexedRepositoryNote[]> {
  return requestResult(
    transaction
      .objectStore(noteStoreName)
      .index(noteIdentityIndexName)
      .getAll(identity),
  );
}

async function readState(
  transaction: IDBTransaction,
  identity: string,
): Promise<IndexedRepositoryState | null> {
  const value = await requestResult(
    transaction.objectStore(stateStoreName).get(identity),
  );

  return value === undefined ? null : parseIndexedState(value);
}

function putChangedNotes(
  store: IDBObjectStore,
  identity: string,
  previousNotes: readonly IndexedRepositoryNote[],
  content: WorkspaceRepositoryContentDto,
) {
  const previousById = new Map(previousNotes.map((note) => [note.id, note]));
  const nextIds = new Set(content.workspace.notes.map((note) => note.id));

  for (const previous of previousNotes) {
    if (!nextIds.has(previous.id)) {
      store.delete([identity, previous.id]);
    }
  }

  for (const note of content.workspace.notes) {
    if (previousById.get(note.id)?.source !== note.source) {
      store.put({ id: note.id, identity, source: note.source });
    }
  }
}

function createIndexedDbRepositoryCache(
  database: Promise<IDBDatabase>,
): WorkspaceRepositoryCache {
  return {
    async completeSync({
      committedRemoteRevision,
      expectedLocalRevision,
      identity,
    }) {
      const parsedRemoteRevision = parseRepositoryRevision(
        committedRemoteRevision,
      );
      const db = await database;
      const transaction = db.transaction(
        [stateStoreName, noteStoreName],
        "readwrite",
      );
      const completion = transactionComplete(transaction);
      const state = await readState(transaction, identity);

      if (!state) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error(`Local repository state does not exist: ${identity}`);
      }

      state.remoteRevision = parsedRemoteRevision;
      state.pendingBaseRevision =
        state.localRevision === expectedLocalRevision
          ? null
          : parsedRemoteRevision;
      transaction.objectStore(stateStoreName).put(state);
      const notes = await readNotes(transaction, identity);

      await completion;
      return toLocalState(state, notes);
    },
    async create({ identity, localRevision, snapshot }) {
      const parsedSnapshot = parseWorkspaceRepositorySnapshot(snapshot);
      const db = await database;
      const transaction = db.transaction(
        [stateStoreName, noteStoreName],
        "readwrite",
      );
      const completion = transactionComplete(transaction);
      const existing = await readState(transaction, identity);

      if (existing) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error(`Local repository state already exists: ${identity}`);
      }

      const state: WorkspaceRepositoryLocalState = {
        content: parsedSnapshot.content,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsedSnapshot.revision,
      };
      const indexedState = toIndexedState(identity, state);

      transaction.objectStore(stateStoreName).add(indexedState);
      putChangedNotes(
        transaction.objectStore(noteStoreName),
        identity,
        [],
        parsedSnapshot.content,
      );
      await completion;
      return structuredClone(state);
    },
    async load(identity) {
      const db = await database;
      const transaction = db.transaction(
        [stateStoreName, noteStoreName],
        "readonly",
      );
      const completion = transactionComplete(transaction);
      const state = await readState(transaction, identity);

      if (!state) {
        await completion;
        return null;
      }

      const notes = await readNotes(transaction, identity);

      await completion;
      return toLocalState(state, notes);
    },
    async recordConflict({ currentRemoteRevision, identity }) {
      const parsedRemoteRevision = parseRepositoryRevision(currentRemoteRevision);
      const db = await database;
      const transaction = db.transaction(
        [stateStoreName, noteStoreName],
        "readwrite",
      );
      const completion = transactionComplete(transaction);
      const state = await readState(transaction, identity);

      if (!state) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error(`Local repository state does not exist: ${identity}`);
      }

      state.remoteRevision = parsedRemoteRevision;
      transaction.objectStore(stateStoreName).put(state);
      const notes = await readNotes(transaction, identity);

      await completion;
      return toLocalState(state, notes);
    },
    async remove(identity) {
      const db = await database;
      const transaction = db.transaction(
        [stateStoreName, noteStoreName],
        "readwrite",
      );
      const completion = transactionComplete(transaction);

      transaction.objectStore(stateStoreName).delete(identity);
      const keys = await requestResult(
        transaction
          .objectStore(noteStoreName)
          .index(noteIdentityIndexName)
          .getAllKeys(identity),
      );
      keys.forEach((key) => transaction.objectStore(noteStoreName).delete(key));
      await completion;
    },
    async replaceFromRemote({
      expectedLocalRevision,
      identity,
      localRevision,
      snapshot,
    }) {
      const parsedSnapshot = parseWorkspaceRepositorySnapshot(snapshot);
      const db = await database;
      const transaction = db.transaction(
        [stateStoreName, noteStoreName],
        "readwrite",
      );
      const completion = transactionComplete(transaction);
      const current = await readState(transaction, identity);

      if (!current) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error(`Local repository state does not exist: ${identity}`);
      }
      if (current.localRevision !== expectedLocalRevision) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new WorkspaceRepositoryLocalConflictError(current.localRevision);
      }

      const previousNotes = await readNotes(transaction, identity);
      const state: WorkspaceRepositoryLocalState = {
        content: parsedSnapshot.content,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsedSnapshot.revision,
      };

      transaction.objectStore(stateStoreName).put(toIndexedState(identity, state));
      putChangedNotes(
        transaction.objectStore(noteStoreName),
        identity,
        previousNotes,
        parsedSnapshot.content,
      );
      await completion;
      return structuredClone(state);
    },
    async stage({
      content,
      expectedLocalRevision,
      identity,
      localRevision,
    }) {
      const parsedContent = parseWorkspaceRepositoryContent(content);
      const db = await database;
      const transaction = db.transaction(
        [stateStoreName, noteStoreName],
        "readwrite",
      );
      const completion = transactionComplete(transaction);
      const state = await readState(transaction, identity);

      if (!state) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error(`Local repository state does not exist: ${identity}`);
      }
      if (state.localRevision !== expectedLocalRevision) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new WorkspaceRepositoryLocalConflictError(state.localRevision);
      }
      if (!state.pendingBaseRevision && !state.remoteRevision) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error("Cannot stage a repository without a known remote base.");
      }

      const previousNotes = await readNotes(transaction, identity);
      const next: WorkspaceRepositoryLocalState = {
        content: parsedContent,
        localRevision,
        pendingBaseRevision:
          state.pendingBaseRevision ?? state.remoteRevision,
        remoteRevision: state.remoteRevision,
      };

      transaction.objectStore(stateStoreName).put(toIndexedState(identity, next));
      putChangedNotes(
        transaction.objectStore(noteStoreName),
        identity,
        previousNotes,
        parsedContent,
      );
      await completion;
      return structuredClone(next);
    },
  };
}

function createIndexedDbCatalogCache(
  database: Promise<IDBDatabase>,
): WorkspaceRepositoryCatalogCache {
  return {
    async load(identity) {
      const db = await database;
      const transaction = db.transaction(catalogStoreName, "readonly");
      const completion = transactionComplete(transaction);
      const value = await requestResult(
        transaction.objectStore(catalogStoreName).get(identity),
      );

      await completion;
      return value === undefined
        ? null
        : parseWorkspaceRepositoryCatalogCacheState(value);
    },
    async remove(identity) {
      const db = await database;
      const transaction = db.transaction(catalogStoreName, "readwrite");
      const completion = transactionComplete(transaction);

      transaction.objectStore(catalogStoreName).delete(identity);
      await completion;
    },
    async save(identity, state) {
      const db = await database;
      const transaction = db.transaction(catalogStoreName, "readwrite");
      const completion = transactionComplete(transaction);

      transaction.objectStore(catalogStoreName).put(state, identity);
      await completion;
    },
  };
}

export function createIndexedDbRepositoryClientCache(
  indexedDb: IDBFactory,
): BrowserRepositoryClientCache {
  const database = openDatabase(indexedDb);

  return {
    catalogs: createIndexedDbCatalogCache(database),
    async createRepositoryAtomically({
      catalogIdentity,
      content,
      descriptor,
      localRevision,
      remoteRevision,
      repositoryIdentity,
    }) {
      const parsedContent = parseWorkspaceRepositoryContent(content);
      const parsedDescriptor = parseRepositoryDescriptor(descriptor);
      const parsedRemoteRevision = parseRepositoryRevision(remoteRevision);
      const db = await database;
      const transaction = db.transaction(
        [catalogStoreName, stateStoreName, noteStoreName],
        "readwrite",
      );
      const completion = transactionComplete(transaction);
      const catalogValue = await requestResult(
        transaction.objectStore(catalogStoreName).get(catalogIdentity),
      );
      const catalog = catalogValue === undefined
        ? {
            creatableAdapters: ["browser" as const],
            issues: [],
            repositories: [],
            version: 3 as const,
          }
        : parseWorkspaceRepositoryCatalogCacheState(catalogValue);
      const existingState = await readState(transaction, repositoryIdentity);

      if (
        existingState ||
        catalog.repositories.some((repository) =>
          repository.id === parsedDescriptor.id
        ) ||
        catalog.issues.some((issue) => issue.id === parsedDescriptor.id)
      ) {
        transaction.abort();
        await completion.catch(() => undefined);
        throw new Error(
          `Browser repository already exists: ${parsedDescriptor.id}`,
        );
      }

      const state: WorkspaceRepositoryLocalState = {
        content: parsedContent,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsedRemoteRevision,
      };

      transaction.objectStore(catalogStoreName).put(
        {
          creatableAdapters: ["browser"],
          issues: catalog.issues,
          repositories: [...catalog.repositories, parsedDescriptor].sort(
            (left, right) => left.id.localeCompare(right.id),
          ),
          version: 3,
        },
        catalogIdentity,
      );
      transaction
        .objectStore(stateStoreName)
        .add(toIndexedState(repositoryIdentity, state));
      putChangedNotes(
        transaction.objectStore(noteStoreName),
        repositoryIdentity,
        [],
        parsedContent,
      );
      await completion;
    },
    async deleteRepositoryAtomically({
      catalogIdentity,
      repositoryId,
      repositoryIdentity,
    }) {
      const db = await database;
      const transaction = db.transaction(
        [catalogStoreName, stateStoreName, noteStoreName],
        "readwrite",
      );
      const completion = transactionComplete(transaction);
      const catalogValue = await requestResult(
        transaction.objectStore(catalogStoreName).get(catalogIdentity),
      );

      if (catalogValue !== undefined) {
        const catalog = parseWorkspaceRepositoryCatalogCacheState(catalogValue);

        transaction.objectStore(catalogStoreName).put(
          {
            ...catalog,
            issues: catalog.issues.filter(({ id }) => id !== repositoryId),
            repositories: catalog.repositories.filter(
              ({ id }) => id !== repositoryId,
            ),
          },
          catalogIdentity,
        );
      }

      transaction.objectStore(stateStoreName).delete(repositoryIdentity);
      const keys = await requestResult(
        transaction
          .objectStore(noteStoreName)
          .index(noteIdentityIndexName)
          .getAllKeys(repositoryIdentity),
      );
      keys.forEach((key) => transaction.objectStore(noteStoreName).delete(key));
      await completion;
    },
    snapshots: createIndexedDbRepositoryCache(database),
  };
}

export function createBrowserRepositoryClientCache() {
  if (!globalThis.indexedDB) {
    throw new Error("IndexedDB is unavailable");
  }

  return createIndexedDbRepositoryClientCache(globalThis.indexedDB);
}
