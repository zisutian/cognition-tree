import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createBrowserSystemRepositoryCatalog } from "../../../../src/storage/adapters/browser/browserSystemRepository";
import {
  browserSystemRepositoryDatabaseName,
  createBrowserSystemRepositoryStorage,
} from "../../../../src/storage/adapters/browser/browserSystemRepositoryStorage";
import { VersionedRepositoryBackendConflictError } from "../../../../src/storage/repository/versionedRepository";
import {
  validateSystemRepositoryContent,
  validateSystemRepositoryTransition,
} from "../../../../src/storage/repository/systemRepository";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  tamperJournalTestBodyBlockTime,
  tamperJournalTestEntryCreation,
  updateJournalTestBody,
} from "../../../journal/journalTestFixture";
import {
  appendTodoTestCollection,
  createEmptyTodoContent,
} from "../../../todo/todoTestFixture";

const remoteStoreName = "browser-remotes-v1";

function requestResult<Result>(request: IDBRequest<Result>) {
  return new Promise<Result>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

async function openDatabase(indexedDb: IDBFactory) {
  return requestResult(indexedDb.open(browserSystemRepositoryDatabaseName));
}

describe("browser system repositories", () => {
  it("provisions both protected repositories once and keeps repository objects stable", async () => {
    const indexedDb = new IDBFactory();
    const storage = createBrowserSystemRepositoryStorage(indexedDb, {
      validateContent: validateSystemRepositoryContent,
      validateTransition: validateSystemRepositoryTransition,
    });
    const catalog = createBrowserSystemRepositoryCatalog({
      storage,
    });
    const first = await catalog.listRepositories();
    const second = await catalog.listRepositories();

    expect(first).toEqual(second);
    expect(first.issues).toEqual([]);
    expect(first.repositories.map(({ id, label, protected: isProtected }) => ({
      id,
      isProtected,
      label,
    }))).toEqual([
      { id: "system-journal", isProtected: true, label: "日记" },
      { id: "system-todo", isProtected: true, label: "代办" },
    ]);
    expect("createRepository" in catalog).toBe(false);
    expect("deleteRepository" in catalog).toBe(false);
    expect("renameRepository" in catalog).toBe(false);

    const journalDescriptor = first.repositories[0]!;
    const journal = catalog.openRepository(journalDescriptor);

    expect(catalog.openRepository(journalDescriptor)).toBe(journal);
    await expect(journal.loadSnapshot()).resolves.toMatchObject({
      content: {
        days: [],
        purpose: "system-journal",
        schemaVersion: 3,
        syntaxSource: expect.any(String),
      },
      pendingChanges: false,
    });
    await expect(catalog.openRepository(first.repositories[1]!).loadSnapshot())
      .resolves.toMatchObject({
        content: {
          collections: [],
          purpose: "system-todo",
          schemaVersion: 3,
          syntaxSource: expect.any(String),
        },
      });

    const database = await openDatabase(indexedDb);
    const transaction = database.transaction(remoteStoreName, "readonly");
    const completion = transactionComplete(transaction);
    const remotes = await requestResult(
      transaction.objectStore(remoteStoreName).getAll(),
    );

    await completion;
    expect(remotes).toHaveLength(2);
    database.close();
  });

  it("uses CAS for Browser commits", async () => {
    const storage = createBrowserSystemRepositoryStorage(new IDBFactory(), {
      validateContent: validateSystemRepositoryContent,
      validateTransition: validateSystemRepositoryTransition,
    });
    const firstBackend = storage.createBackend("system-todo");
    const secondBackend = storage.createBackend("system-todo");
    const initial = await firstBackend.loadRemoteSnapshot();

    await firstBackend.commitRemoteSnapshot({
      baseRevision: initial.revision,
      content: appendTodoTestCollection(createEmptyTodoContent(), {
        collectionIndex: 1,
        name: "Changed",
      }),
    });
    await expect(secondBackend.commitRemoteSnapshot({
      baseRevision: initial.revision,
      content: initial.content,
    })).rejects.toBeInstanceOf(VersionedRepositoryBackendConflictError);
  });

  it("rejects coordinated creation and body-time tampering without changing Browser remote content", async () => {
    const indexedDb = new IDBFactory();
    const storage = createBrowserSystemRepositoryStorage(indexedDb, {
      validateContent: validateSystemRepositoryContent,
      validateTransition: validateSystemRepositoryTransition,
    });
    const backend = storage.createBackend("system-journal");
    const initial = await backend.loadRemoteSnapshot();
    const valid = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const committed = await backend.commitRemoteSnapshot({
      baseRevision: initial.revision,
      content: valid,
    });
    const database = await openDatabase(indexedDb);
    const beforeRead = database.transaction(remoteStoreName, "readonly");
    const beforeCompletion = transactionComplete(beforeRead);
    const before = await requestResult(
      beforeRead.objectStore(remoteStoreName).get("system-journal"),
    );

    await beforeCompletion;
    const tampered = tamperJournalTestEntryCreation(valid, {
      createdAt: "2026-08-19T10:11:12.000Z",
      entryIndex: 1,
      timezoneOffsetMinutes: -300,
    });

    await expect(backend.commitRemoteSnapshot({
      baseRevision: committed.revision,
      content: tampered,
    })).rejects.toThrow(/createdAt is immutable/);
    const afterRead = database.transaction(remoteStoreName, "readonly");
    const afterCompletion = transactionComplete(afterRead);
    const after = await requestResult(
      afterRead.objectStore(remoteStoreName).get("system-journal"),
    );

    await afterCompletion;
    expect(after).toEqual(before);
    const edited = updateJournalTestBody(valid, {
      body: "正文",
      entryIndex: 1,
      updatedAt: "2026-07-18T00:05:00.000Z",
    });
    const editedCommit = await backend.commitRemoteSnapshot({
      baseRevision: committed.revision,
      content: edited,
    });
    const lateBlock = tamperJournalTestBodyBlockTime(edited, {
      entryIndex: 1,
      updatedAt: "2026-07-18T00:05:01.000Z",
    });
    const beforeLateRead = database.transaction(remoteStoreName, "readonly");
    const beforeLateCompletion = transactionComplete(beforeLateRead);
    const beforeLate = await requestResult(
      beforeLateRead.objectStore(remoteStoreName).get("system-journal"),
    );

    await beforeLateCompletion;
    await expect(backend.commitRemoteSnapshot({
      baseRevision: editedCommit.revision,
      content: lateBlock,
    })).rejects.toThrow(/updated after the entry/);
    const afterLateRead = database.transaction(remoteStoreName, "readonly");
    const afterLateCompletion = transactionComplete(afterLateRead);
    const afterLate = await requestResult(
      afterLateRead.objectStore(remoteStoreName).get("system-journal"),
    );

    await afterLateCompletion;
    expect(afterLate).toEqual(beforeLate);
    await expect(backend.loadRemoteSnapshot()).resolves.toMatchObject({
      content: edited,
      revision: editedCommit.revision,
    });
    database.close();
  });

  it("retains corrupt persistent content and reports retry as fault", async () => {
    const indexedDb = new IDBFactory();
    const storage = createBrowserSystemRepositoryStorage(indexedDb, {
      validateContent: validateSystemRepositoryContent,
      validateTransition: validateSystemRepositoryTransition,
    });
    const catalog = createBrowserSystemRepositoryCatalog({
      storage,
    });

    await catalog.listRepositories();
    const database = await openDatabase(indexedDb);
    const corrupt = {
      content: {
        entries: [],
        purpose: "system-journal",
        schemaVersion: 99,
      },
      purpose: "system-journal",
      revision: `sha256:${"a".repeat(64)}`,
    };
    const write = database.transaction(remoteStoreName, "readwrite");
    const writeCompletion = transactionComplete(write);

    write.objectStore(remoteStoreName).put(corrupt);
    await writeCompletion;

    const projection = await catalog.listRepositories();

    expect(projection.repositories.map(({ id }) => id)).toEqual([
      "system-todo",
    ]);
    expect(projection.issues).toMatchObject([{
      code: "unsupported_repository_version",
      id: "system-journal",
      status: "fault",
    }]);
    await expect(catalog.retryRepository("system-journal")).resolves.toEqual({
      status: "fault",
    });

    const read = database.transaction(remoteStoreName, "readonly");
    const readCompletion = transactionComplete(read);
    const retained = await requestResult(
      read.objectStore(remoteStoreName).get("system-journal"),
    );

    await readCompletion;
    expect(retained).toEqual(corrupt);
    database.close();
  });

  it("retains valid-shaped content whose stored revision is not canonical", async () => {
    const indexedDb = new IDBFactory();
    const storage = createBrowserSystemRepositoryStorage(indexedDb, {
      validateContent: validateSystemRepositoryContent,
      validateTransition: validateSystemRepositoryTransition,
    });
    const catalog = createBrowserSystemRepositoryCatalog({
      storage,
    });

    await catalog.listRepositories();
    const database = await openDatabase(indexedDb);
    const mismatched = {
      content: {
        collections: [],
        purpose: "system-todo",
        schemaVersion: 3,
        syntaxSource: createEmptyTodoContent().syntaxSource,
      },
      purpose: "system-todo",
      revision: `sha256:${"f".repeat(64)}`,
    };
    const write = database.transaction(remoteStoreName, "readwrite");
    const writeCompletion = transactionComplete(write);

    write.objectStore(remoteStoreName).put(mismatched);
    await writeCompletion;

    await expect(catalog.listRepositories()).resolves.toMatchObject({
      issues: [{ code: "repository_corrupt", id: "system-todo" }],
      repositories: [{ id: "system-journal" }],
    });
    const read = database.transaction(remoteStoreName, "readonly");
    const readCompletion = transactionComplete(read);
    const retained = await requestResult(
      read.objectStore(remoteStoreName).get("system-todo"),
    );

    await readCompletion;
    expect(retained).toEqual(mismatched);
    database.close();
  });

  it("does not hide ready repositories when catalog cache saving fails", async () => {
    const storage = createBrowserSystemRepositoryStorage(new IDBFactory(), {
      validateContent: validateSystemRepositoryContent,
      validateTransition: validateSystemRepositoryTransition,
    });
    const catalog = createBrowserSystemRepositoryCatalog({
      storage: {
        ...storage,
        catalogCache: {
          ...storage.catalogCache,
          async save() {
            throw new Error("catalog quota exceeded");
          },
        },
      },
    });

    await expect(catalog.listRepositories()).resolves.toMatchObject({
      issues: [],
      repositories: [
        { id: "system-journal" },
        { id: "system-todo" },
      ],
    });
  });

  it("projects adapter faults instead of throwing when IndexedDB is absent", async () => {
    const catalog = createBrowserSystemRepositoryCatalog({
      validateContent: validateSystemRepositoryContent,
      validateTransition: validateSystemRepositoryTransition,
    });
    const originalIndexedDb = globalThis.indexedDB;

    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: undefined,
    });
    try {
      await expect(catalog.listRepositories()).resolves.toMatchObject({
        issues: [
          { code: "adapter_unavailable", id: "system-journal" },
          { code: "adapter_unavailable", id: "system-todo" },
        ],
        repositories: [],
      });
    } finally {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: originalIndexedDb,
      });
    }
  });

  it("classifies asynchronous IndexedDB open failures as adapter faults", async () => {
    const request = new EventTarget() as IDBOpenDBRequest;
    const openError = new Error("IndexedDB open rejected");

    Object.defineProperty(request, "error", { get: () => openError });
    const indexedDb = {
      open() {
        queueMicrotask(() => request.dispatchEvent(new Event("error")));
        return request;
      },
    } as unknown as IDBFactory;
    const storage = createBrowserSystemRepositoryStorage(indexedDb, {
      validateContent: validateSystemRepositoryContent,
      validateTransition: validateSystemRepositoryTransition,
    });
    const catalog = createBrowserSystemRepositoryCatalog({
      storage,
    });

    await expect(catalog.listRepositories()).resolves.toMatchObject({
      issues: [
        { code: "adapter_unavailable", id: "system-journal" },
        { code: "adapter_unavailable", id: "system-todo" },
      ],
      repositories: [],
    });
  });
});
