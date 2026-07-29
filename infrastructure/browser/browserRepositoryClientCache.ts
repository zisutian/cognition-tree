import { parseRepositoryDescriptor } from "../../contracts/workspace/parseCatalog";
import { UnsupportedRepositoryVersionError } from "../../contracts/workspace/contractValue";
import {
  parseWorkspaceRepositoryContent,
  parseWorkspaceRepositorySnapshot,
} from "../../contracts/workspace/parseRepository";
import { parseRepositoryRevision } from "../../contracts/workspace/revision";
import type {
  LocalDraftRevisionDto,
  RepositoryRevisionDto,
  WorkspaceRepositoryContentDto,
  RepositoryDescriptorDto,
} from "../../contracts/workspace/types";
import type { RepositoryClientCache } from "../persistence/repositoryClientCache";
import type {
  WorkspaceRepositoryCache,
  WorkspaceRepositoryLocalState,
} from "../persistence/workspaceRepositoryCache";
import { WorkspaceRepositoryLocalConflictError } from "../../application/repository/workspaceRepository";
import type {
  VersionedRepositoryConflictRecord,
} from "../../application/persistence/versionedRepository";
import {
  parseAvailableWorkspaceRepositoryLabel,
  projectWorkspaceRepositoryLabelIssues,
} from "../persistence/repositoryLabelPolicy";
import {
  parseWorkspaceRepositoryCatalogCacheState,
  type WorkspaceRepositoryCatalogCache,
} from "../persistence/workspaceRepositoryCatalogCache";
import {
  abortTransaction,
  openIndexedDatabase,
  requestResult,
  transactionComplete,
} from "./indexedDbPrimitives";

export const browserRepositoryDatabaseName = "cognition-tree.repository-cache";
const databaseVersion = 4;
const catalogStoreName = "repository-catalogs-v4";
const stateStoreName = "repository-states-v4";
const noteStoreName = "repository-notes-v4";
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
  baseContent?: WorkspaceRepositoryContentDto | null;
  conflict?: VersionedRepositoryConflictRecord<
    WorkspaceRepositoryContentDto,
    RepositoryRevisionDto
  > | null;
  identity: string;
  localRevision: LocalDraftRevisionDto;
  noteIds: string[];
  pendingBaseRevision: RepositoryRevisionDto | null;
  remoteRevision: RepositoryRevisionDto | null;
  schemaVersion: 4;
  syntax: WorkspaceRepositoryContentDto["syntax"];
  workspace: Pick<WorkspaceRepositoryContentDto["workspace"], "id" | "name" | "tree">;
};

type IndexedRepositoryNote = {
  id: string;
  identity: string;
  source: string;
};

function openDatabase(indexedDb: IDBFactory) {
  let rejectedVersion: number | null = null;
  const opened = openIndexedDatabase(
    indexedDb,
    browserRepositoryDatabaseName,
    databaseVersion,
    (database, oldVersion, transaction) => {
      if (oldVersion !== 0) {
        rejectedVersion = oldVersion;
        transaction.abort();
        return;
      }

      database.createObjectStore(catalogStoreName);
      database.createObjectStore(stateStoreName, { keyPath: "identity" });
      const noteStore = database.createObjectStore(noteStoreName, {
        keyPath: ["identity", "id"],
      });

      noteStore.createIndex(noteIdentityIndexName, "identity", {
        unique: false,
      });
    },
  );

  return opened.catch((error: unknown) => {
    const isFutureVersion = typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "VersionError";

    if (rejectedVersion !== null || isFutureVersion) {
      throw new UnsupportedRepositoryVersionError(
        "$.databaseVersion",
        rejectedVersion ?? undefined,
      );
    }
    throw error;
  });
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

  if (state.schemaVersion !== 4) {
    throw new UnsupportedRepositoryVersionError(
      "$.schemaVersion",
      state.schemaVersion,
    );
  }

  if (
    typeof state.identity !== "string" ||
    !isLocalRevision(state.localRevision) ||
    !Array.isArray(state.noteIds) ||
    !state.noteIds.every((id) => typeof id === "string") ||
    (state.pendingBaseRevision !== null &&
      !isRemoteRevision(state.pendingBaseRevision)) ||
    (state.remoteRevision !== null && !isRemoteRevision(state.remoteRevision)) ||
    !state.syntax ||
    typeof state.syntax !== "object" ||
    !state.workspace ||
    typeof state.workspace !== "object"
  ) {
    throw new Error("Invalid IndexedDB repository state");
  }

  const baseContent = state.baseContent === undefined
    ? undefined
    : state.baseContent === null
      ? null
      : parseWorkspaceRepositoryContent(state.baseContent);
  const conflict = state.conflict === undefined || state.conflict === null
    ? state.conflict
    : (() => {
        const candidate = state.conflict as Partial<
          VersionedRepositoryConflictRecord<
            WorkspaceRepositoryContentDto,
            RepositoryRevisionDto
          >
        >;

        if (
          !Array.isArray(candidate.unitIds) ||
          !candidate.unitIds.every((unitId) => typeof unitId === "string") ||
          typeof candidate.remoteRevision !== "string"
        ) {
          throw new Error("Invalid IndexedDB repository conflict record");
        }
        return {
          base: parseWorkspaceRepositoryContent(candidate.base),
          local: parseWorkspaceRepositoryContent(candidate.local),
          remote: parseWorkspaceRepositoryContent(candidate.remote),
          remoteRevision: parseRepositoryRevision(candidate.remoteRevision),
          unitIds: [...new Set(candidate.unitIds)].sort(),
        };
      })();

  return {
    ...(state as IndexedRepositoryState),
    ...(baseContent === undefined ? {} : { baseContent }),
    ...(conflict === undefined ? {} : { conflict }),
  };
}

function toIndexedState(
  identity: string,
  state: Omit<WorkspaceRepositoryLocalState, "content"> & {
    content: WorkspaceRepositoryContentDto;
  },
  syncContext?: Pick<IndexedRepositoryState, "baseContent" | "conflict">,
): IndexedRepositoryState {
  return {
    ...(syncContext ?? {}),
    identity,
    localRevision: state.localRevision,
    noteIds: state.content.workspace.notes.map((note) => note.id),
    pendingBaseRevision: state.pendingBaseRevision,
    remoteRevision: state.remoteRevision,
    schemaVersion: 4,
    syntax: state.content.syntax,
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
    schemaVersion: 4,
    syntax: state.syntax,
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
      committedContent,
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
        await abortTransaction(transaction, completion);
        throw new Error(`Local repository state does not exist: ${identity}`);
      }

      state.remoteRevision = parsedRemoteRevision;
      state.pendingBaseRevision =
        state.localRevision === expectedLocalRevision
          ? null
          : parsedRemoteRevision;
      state.baseContent = parseWorkspaceRepositoryContent(committedContent);
      state.conflict = null;
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
        await abortTransaction(transaction, completion);
        throw new Error(`Local repository state already exists: ${identity}`);
      }

      const state: WorkspaceRepositoryLocalState = {
        content: parsedSnapshot.content,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsedSnapshot.revision,
      };
      const indexedState = toIndexedState(identity, state);
      indexedState.baseContent = parsedSnapshot.content;
      indexedState.conflict = null;

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
    async loadSyncContext(identity) {
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
      const content = toLocalState(state, notes).content;

      await completion;
      return {
        baseContent: state.baseContent === undefined
          ? state.pendingBaseRevision ? null : content
          : state.baseContent,
        conflict: state.conflict ?? null,
      };
    },
    async recordConflict({
      baseContent,
      currentRemoteRevision,
      identity,
      localContent,
      remoteContent,
      unitIds,
    }) {
      const parsedRemoteRevision = parseRepositoryRevision(currentRemoteRevision);
      const db = await database;
      const transaction = db.transaction(
        [stateStoreName, noteStoreName],
        "readwrite",
      );
      const completion = transactionComplete(transaction);
      const state = await readState(transaction, identity);

      if (!state) {
        await abortTransaction(transaction, completion);
        throw new Error(`Local repository state does not exist: ${identity}`);
      }

      state.remoteRevision = parsedRemoteRevision;
      state.baseContent = parseWorkspaceRepositoryContent(baseContent);
      state.conflict = {
        base: parseWorkspaceRepositoryContent(baseContent),
        local: parseWorkspaceRepositoryContent(localContent),
        remote: parseWorkspaceRepositoryContent(remoteContent),
        remoteRevision: parsedRemoteRevision,
        unitIds: [...new Set(unitIds)].sort(),
      };
      transaction.objectStore(stateStoreName).put(state);
      const notes = await readNotes(transaction, identity);

      await completion;
      return toLocalState(state, notes);
    },
    async recordConflictRevision({ currentRemoteRevision, identity }) {
      const parsedRemoteRevision = parseRepositoryRevision(currentRemoteRevision);
      const db = await database;
      const transaction = db.transaction(
        [stateStoreName, noteStoreName],
        "readwrite",
      );
      const completion = transactionComplete(transaction);
      const state = await readState(transaction, identity);

      if (!state) {
        await abortTransaction(transaction, completion);
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
    async rebaseFromRemote({
      content,
      expectedLocalRevision,
      identity,
      localRevision,
      pendingChanges,
      snapshot,
    }) {
      const parsedSnapshot = parseWorkspaceRepositorySnapshot(snapshot);
      const parsedContent = parseWorkspaceRepositoryContent(content);
      const db = await database;
      const transaction = db.transaction(
        [stateStoreName, noteStoreName],
        "readwrite",
      );
      const completion = transactionComplete(transaction);
      const current = await readState(transaction, identity);

      if (!current) {
        await abortTransaction(transaction, completion);
        throw new Error(`Local repository state does not exist: ${identity}`);
      }
      if (current.localRevision !== expectedLocalRevision) {
        await abortTransaction(transaction, completion);
        throw new WorkspaceRepositoryLocalConflictError(current.localRevision);
      }
      const previousNotes = await readNotes(transaction, identity);
      const state: WorkspaceRepositoryLocalState = {
        content: parsedContent,
        localRevision,
        pendingBaseRevision: pendingChanges ? parsedSnapshot.revision : null,
        remoteRevision: parsedSnapshot.revision,
      };

      transaction.objectStore(stateStoreName).put(toIndexedState(
        identity,
        state,
        { baseContent: parsedSnapshot.content, conflict: null },
      ));
      putChangedNotes(
        transaction.objectStore(noteStoreName),
        identity,
        previousNotes,
        parsedContent,
      );
      await completion;
      return structuredClone(state);
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
        await abortTransaction(transaction, completion);
        throw new Error(`Local repository state does not exist: ${identity}`);
      }
      if (current.localRevision !== expectedLocalRevision) {
        await abortTransaction(transaction, completion);
        throw new WorkspaceRepositoryLocalConflictError(current.localRevision);
      }

      const previousNotes = await readNotes(transaction, identity);
      const state: WorkspaceRepositoryLocalState = {
        content: parsedSnapshot.content,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsedSnapshot.revision,
      };

      transaction.objectStore(stateStoreName).put(toIndexedState(
        identity,
        state,
        { baseContent: parsedSnapshot.content, conflict: null },
      ));
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
        await abortTransaction(transaction, completion);
        throw new Error(`Local repository state does not exist: ${identity}`);
      }
      if (state.localRevision !== expectedLocalRevision) {
        await abortTransaction(transaction, completion);
        throw new WorkspaceRepositoryLocalConflictError(state.localRevision);
      }
      if (!state.pendingBaseRevision && !state.remoteRevision) {
        await abortTransaction(transaction, completion);
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

      transaction.objectStore(stateStoreName).put(toIndexedState(
        identity,
        next,
        {
          baseContent: state.baseContent === undefined
            ? state.pendingBaseRevision ? null : toLocalState(
                state,
                previousNotes,
              ).content
            : state.baseContent,
          conflict: state.conflict ?? null,
        },
      ));
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
            version: 4 as const,
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
        await abortTransaction(transaction, completion);
        throw new Error(
          `Browser repository already exists: ${parsedDescriptor.id}`,
        );
      }

      const label = parseAvailableWorkspaceRepositoryLabel(
        parsedDescriptor.label,
        catalog.repositories,
      );
      const nextDescriptor = { ...parsedDescriptor, label };

      const state: WorkspaceRepositoryLocalState = {
        content: parsedContent,
        localRevision,
        pendingBaseRevision: null,
        remoteRevision: parsedRemoteRevision,
      };

      const projectedCatalog = projectWorkspaceRepositoryLabelIssues({
          creatableAdapters: ["browser"],
          issues: catalog.issues,
          repositories: [...catalog.repositories, nextDescriptor].sort(
            (left, right) => left.id.localeCompare(right.id),
          ),
        });

      transaction.objectStore(catalogStoreName).put(
        { ...projectedCatalog, version: 4 },
        catalogIdentity,
      );
      transaction
        .objectStore(stateStoreName)
        .add(toIndexedState(
          repositoryIdentity,
          state,
          { baseContent: parsedContent, conflict: null },
        ));
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

        const projectedCatalog = projectWorkspaceRepositoryLabelIssues({
            creatableAdapters: catalog.creatableAdapters,
            issues: catalog.issues.filter(({ id }) => id !== repositoryId),
            repositories: catalog.repositories.filter(
              ({ id }) => id !== repositoryId,
            ),
          });

        transaction.objectStore(catalogStoreName).put(
          { ...projectedCatalog, version: 4 },
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
    async renameRepositoryAtomically({
      catalogIdentity,
      label,
      repositoryId,
    }) {
      const db = await database;
      const transaction = db.transaction(catalogStoreName, "readwrite");
      const completion = transactionComplete(transaction);
      const store = transaction.objectStore(catalogStoreName);
      const catalogValue = await requestResult(store.get(catalogIdentity));

      if (catalogValue === undefined) {
        await abortTransaction(transaction, completion);
        throw new Error(`Repository catalog does not exist: ${catalogIdentity}`);
      }
      const catalog = parseWorkspaceRepositoryCatalogCacheState(catalogValue);
      const descriptor = catalog.repositories.find(({ id }) =>
        id === repositoryId
      );

      if (!descriptor) {
        await abortTransaction(transaction, completion);
        throw new Error(`Browser repository does not exist: ${repositoryId}`);
      }
      const parsedLabel = parseAvailableWorkspaceRepositoryLabel(
        label,
        catalog.repositories,
        repositoryId,
      );

      const projectedCatalog = projectWorkspaceRepositoryLabelIssues({
        creatableAdapters: catalog.creatableAdapters,
        issues: catalog.issues,
        repositories: catalog.repositories.map((repository) =>
          repository.id === repositoryId
            ? { ...repository, label: parsedLabel, labelIssue: null }
            : repository
        ),
      });

      store.put({ ...projectedCatalog, version: 4 }, catalogIdentity);
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
