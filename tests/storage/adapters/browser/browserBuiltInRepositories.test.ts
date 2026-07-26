// SPDX-License-Identifier: GPL-3.0-or-later

import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  browserJournalDatabaseName,
  browserTodoDatabaseName,
  createBrowserJournalStorage,
  createBrowserTodoStorage,
} from "../../../../infrastructure/browser/browserBuiltInRepositories";
import { createBrowserBuiltInCatalog } from "../../../../infrastructure/browser/browserBuiltInCatalog";
import { VersionedRepositoryBackendConflictError } from "../../../../application/persistence/versionedRepository";
import {
  migrateTodoV3Content,
  serializeTodoV3RevisionContent,
} from "../../../../contracts/todo/migrations/todoV3ToV4";
import { serializeTodoRevisionContent } from "../../../../contracts/todo/revision";
import { createVersionedContentRevision } from "../../../../infrastructure/persistence/versionedContentRevision";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  tamperJournalTestEntryCreation,
} from "../../../journal/journalTestFixture";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoTimestamp,
} from "../../../todo/todoTestFixture";

const legacyDatabaseName = "cognition-tree.system-repositories";

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

async function openCurrentDatabase(indexedDb: IDBFactory, name: string) {
  const request = indexedDb.open(name, 1);

  request.addEventListener("upgradeneeded", () => {
    request.result.createObjectStore("meta-v1");
    request.result.createObjectStore("remote-v1");
    request.result.createObjectStore("local-v1", { keyPath: "identity" });
  });
  return requestResult(request);
}

function createTodoV3Content() {
  const current = appendTodoTestItem(
    appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
      createdAt: todoTimestamp(1),
      name: "浏览器迁移",
    }),
    {
      collectionIndex: 1,
      createdAt: todoTimestamp(2),
      itemIndex: 1,
    },
  );

  return {
    ...current,
    collections: current.collections.map(
      ({ recurrences: _, ...collection }) => collection,
    ),
    schemaVersion: 3 as const,
  };
}

async function seedRetiredDatabase(indexedDb: IDBFactory) {
  const request = indexedDb.open(legacyDatabaseName, 2);

  request.addEventListener("upgradeneeded", () => {
    request.result.createObjectStore("browser-remotes-v1", {
      keyPath: "purpose",
    });
    request.result.createObjectStore("local-states-v1", {
      keyPath: "identity",
    });
    request.result.createObjectStore("catalog-v1");
    request.result.createObjectStore("storage-epochs-v1", {
      keyPath: "purpose",
    });
  });
  const database = await requestResult(request);
  const transaction = database.transaction([
    "browser-remotes-v1",
    "local-states-v1",
    "catalog-v1",
    "storage-epochs-v1",
  ], "readwrite");
  const completion = transactionComplete(transaction);

  for (const purpose of ["system-journal", "system-todo"] as const) {
    transaction.objectStore("browser-remotes-v1").put({
      content: { purpose, schemaVersion: 2 },
      purpose,
      revision: `sha256:${(
        purpose === "system-journal" ? "a" : "b"
      ).repeat(64)}`,
    });
    transaction.objectStore("local-states-v1").put({
      content: { purpose, schemaVersion: 2 },
      identity: `browser-system:${purpose}`,
      localRevision: `draft:00000000-0000-4000-8000-${
        purpose === "system-journal" ? "000000000001" : "000000000002"
      }`,
      pendingBaseRevision: null,
      remoteRevision: null,
    });
    transaction.objectStore("storage-epochs-v1").put({
      epoch: 2,
      purpose,
    });
  }
  transaction.objectStore("catalog-v1").put({
    issues: [{ id: "system-journal" }, { id: "system-todo" }],
    repositories: [{ id: "system-journal" }, { id: "system-todo" }],
  }, "cached");
  await completion;
  database.close();
}

describe("Browser built-in data repositories", () => {
  it("keeps Journal and Todo remotes, caches, and descriptors isolated", async () => {
    const indexedDb = new IDBFactory();
    const journalStorage = createBrowserJournalStorage(indexedDb);
    const todoStorage = createBrowserTodoStorage(indexedDb);
    const catalog = createBrowserBuiltInCatalog({
      journalStorage,
      todoStorage,
    });
    const projection = await catalog.listBuiltIns();

    expect(projection).toEqual({
      issues: [],
      repositories: [
        expect.objectContaining({
          id: "journal",
          location: {
            databaseName: browserJournalDatabaseName,
            type: "browser",
          },
          protected: true,
        }),
        expect.objectContaining({
          id: "todo",
          location: {
            databaseName: browserTodoDatabaseName,
            type: "browser",
          },
          protected: true,
        }),
      ],
    });
    const journalBase = await journalStorage.backend.loadRemoteSnapshot();
    const journalContent = appendJournalTestEntry(
      createEmptyJournalContent(),
      { createdAt: "2026-07-18T00:00:01.000Z", entryIndex: 1 },
    );
    const journalCommit = await journalStorage.backend.commitRemoteSnapshot({
      baseRevision: journalBase.revision,
      content: journalContent,
    });

    await expect(journalStorage.backend.loadRemoteSnapshot()).resolves.toEqual({
      content: journalContent,
      revision: journalCommit.revision,
    });
    await expect(todoStorage.backend.loadRemoteSnapshot()).resolves.toMatchObject({
      content: createEmptyTodoContent(),
    });
    const journalDescriptor = projection.repositories.find(
      ({ id }) => id === "journal",
    )!;

    expect(catalog.openJournal(journalDescriptor)).toBe(
      catalog.openJournal(journalDescriptor),
    );
    expect(() => catalog.openTodo(journalDescriptor)).toThrow(
      "Todo descriptor is invalid",
    );
  });

  it("enforces domain transitions and compare-and-swap before publishing", async () => {
    const indexedDb = new IDBFactory();
    const journalStorage = createBrowserJournalStorage(indexedDb);
    const base = await journalStorage.backend.loadRemoteSnapshot();
    const content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const committed = await journalStorage.backend.commitRemoteSnapshot({
      baseRevision: base.revision,
      content,
    });
    const tampered = tamperJournalTestEntryCreation(content, {
      createdAt: "2026-07-19T00:00:01.000Z",
      entryIndex: 1,
      timezoneOffsetMinutes: 480,
    });

    await expect(journalStorage.backend.commitRemoteSnapshot({
      baseRevision: committed.revision,
      content: tampered,
    })).rejects.toThrow(/createdAt is immutable/);
    await expect(journalStorage.backend.commitRemoteSnapshot({
      baseRevision: base.revision,
      content,
    })).rejects.toBeInstanceOf(VersionedRepositoryBackendConflictError);

    const todoStorage = createBrowserTodoStorage(indexedDb);
    const todoBase = await todoStorage.backend.loadRemoteSnapshot();
    const validTodo = appendTodoTestItem(
      appendTodoTestCollection(createEmptyTodoContent(), {
        collectionIndex: 1,
        createdAt: todoTimestamp(1),
      }),
      {
        collectionIndex: 1,
        createdAt: todoTimestamp(2),
        itemIndex: 1,
      },
    );
    const todoCommit = await todoStorage.backend.commitRemoteSnapshot({
      baseRevision: todoBase.revision,
      content: validTodo,
    });
    const invalidTodo = {
      ...validTodo,
      collections: [{
        ...validTodo.collections[0]!,
        source: validTodo.collections[0]!.source.replace(
          `id=${todoBlockId(1)} created=${todoTimestamp(2)}`,
          `id=${todoBlockId(1)} created=${todoTimestamp(3)}`,
        ),
      }],
    };

    await expect(todoStorage.backend.commitRemoteSnapshot({
      baseRevision: todoCommit.revision,
      content: invalidTodo,
    })).rejects.toThrow(/createdAt is immutable/);
  });

  it("does not open or alter the retired shared database", async () => {
    const indexedDb = new IDBFactory();

    await seedRetiredDatabase(indexedDb);
    const open = vi.spyOn(indexedDb, "open");

    await expect(createBrowserJournalStorage(indexedDb).inspect()).resolves
      .toEqual({ status: "ready" });
    expect(open.mock.calls.map(([databaseName]) => databaseName)).toEqual([
      browserJournalDatabaseName,
    ]);
    open.mockRestore();
    const database = await requestResult(indexedDb.open(legacyDatabaseName, 2));
    const transaction = database.transaction([
      "browser-remotes-v1",
      "local-states-v1",
      "catalog-v1",
      "storage-epochs-v1",
    ], "readonly");
    const completion = transactionComplete(transaction);
    const [remotes, locals, epochs, catalog] = await Promise.all([
      requestResult(transaction.objectStore("browser-remotes-v1").getAll()),
      requestResult(transaction.objectStore("local-states-v1").getAll()),
      requestResult(transaction.objectStore("storage-epochs-v1").getAll()),
      requestResult(transaction.objectStore("catalog-v1").get("cached")),
    ]);

    await completion;
    database.close();
    expect(remotes).toHaveLength(2);
    expect(locals).toHaveLength(2);
    expect(epochs).toHaveLength(2);
    expect(catalog).toEqual({
      issues: [{ id: "system-journal" }, { id: "system-todo" }],
      repositories: [{ id: "system-journal" }, { id: "system-todo" }],
    });
  });

  it("re-provisions only the current domain when its epoch is lower", async () => {
    const indexedDb = new IDBFactory();
    const oldJournal = createBrowserJournalStorage(indexedDb, 2);
    const journalBase = await oldJournal.backend.loadRemoteSnapshot();
    const journalContent = appendJournalTestEntry(
      createEmptyJournalContent(),
      { createdAt: "2026-07-18T00:00:01.000Z", entryIndex: 1 },
    );

    await oldJournal.backend.commitRemoteSnapshot({
      baseRevision: journalBase.revision,
      content: journalContent,
    });
    const todo = createBrowserTodoStorage(indexedDb);
    const todoBase = await todo.backend.loadRemoteSnapshot();
    const todoContent = appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
      createdAt: todoTimestamp(1),
      name: "必须保留",
    });

    await todo.backend.commitRemoteSnapshot({
      baseRevision: todoBase.revision,
      content: todoContent,
    });

    const currentJournal = createBrowserJournalStorage(indexedDb);

    await expect(currentJournal.backend.loadRemoteSnapshot()).resolves
      .toMatchObject({ content: createEmptyJournalContent() });
    await expect(todo.backend.loadRemoteSnapshot()).resolves
      .toMatchObject({ content: todoContent });
  });

  it("atomically migrates Todo v3 remote, clean cache, and pending drafts", async () => {
    const indexedDb = new IDBFactory();
    const database = await openCurrentDatabase(
      indexedDb,
      browserTodoDatabaseName,
    );
    const v3 = createTodoV3Content();
    const oldRevision = await createVersionedContentRevision(
      serializeTodoV3RevisionContent(v3),
    );
    const seed = database.transaction([
      "meta-v1",
      "remote-v1",
      "local-v1",
    ], "readwrite");
    const seedCompletion = transactionComplete(seed);
    const cleanIdentity = "todo-clean";
    const pendingIdentity = "todo-pending";
    const conflictIdentity = "todo-conflict";

    seed.objectStore("meta-v1").put(3, "storage-epoch");
    seed.objectStore("remote-v1").put({
      content: v3,
      revision: oldRevision,
    }, "snapshot");
    seed.objectStore("local-v1").put({
      content: v3,
      identity: cleanIdentity,
      localRevision: "draft:00000000-0000-4000-8000-000000000001",
      pendingBaseRevision: null,
      remoteRevision: oldRevision,
    });
    seed.objectStore("local-v1").put({
      content: v3,
      identity: pendingIdentity,
      localRevision: "draft:00000000-0000-4000-8000-000000000002",
      pendingBaseRevision: oldRevision,
      remoteRevision: oldRevision,
    });
    const unknownBase = `sha256:${"f".repeat(64)}`;

    seed.objectStore("local-v1").put({
      content: v3,
      identity: conflictIdentity,
      localRevision: "draft:00000000-0000-4000-8000-000000000003",
      pendingBaseRevision: unknownBase,
      remoteRevision: oldRevision,
    });
    await seedCompletion;
    database.close();

    const storage = createBrowserTodoStorage(indexedDb);
    const migrated = migrateTodoV3Content(v3);
    const expectedRevision = await createVersionedContentRevision(
      serializeTodoRevisionContent(migrated),
    );

    await expect(storage.backend.loadRemoteSnapshot()).resolves.toEqual({
      content: migrated,
      revision: expectedRevision,
    });
    await expect(storage.cache.load(cleanIdentity)).resolves.toMatchObject({
      content: migrated,
      pendingBaseRevision: null,
      remoteRevision: expectedRevision,
    });
    await expect(storage.cache.load(pendingIdentity)).resolves.toMatchObject({
      content: migrated,
      pendingBaseRevision: expectedRevision,
      remoteRevision: expectedRevision,
    });
    await expect(storage.cache.load(conflictIdentity)).resolves.toMatchObject({
      content: migrated,
      pendingBaseRevision: unknownBase,
      remoteRevision: expectedRevision,
    });

    const reopened = await requestResult(
      indexedDb.open(browserTodoDatabaseName, 1),
    );
    const read = reopened.transaction("meta-v1", "readonly");
    const readCompletion = transactionComplete(read);

    await expect(requestResult(
      read.objectStore("meta-v1").get("storage-epoch"),
    )).resolves.toBe(4);
    await readCompletion;
    reopened.close();
  });

  it("preserves every Todo v3 record when migration validation fails", async () => {
    const indexedDb = new IDBFactory();
    const database = await openCurrentDatabase(
      indexedDb,
      browserTodoDatabaseName,
    );
    const v3 = createTodoV3Content();
    const invalidRevision = `sha256:${"e".repeat(64)}`;
    const localState = {
      content: v3,
      identity: "todo-retained",
      localRevision: "draft:00000000-0000-4000-8000-000000000004",
      pendingBaseRevision: null,
      remoteRevision: invalidRevision,
    };
    const snapshot = { content: v3, revision: invalidRevision };
    const seed = database.transaction([
      "meta-v1",
      "remote-v1",
      "local-v1",
    ], "readwrite");
    const seedCompletion = transactionComplete(seed);

    seed.objectStore("meta-v1").put(3, "storage-epoch");
    seed.objectStore("remote-v1").put(snapshot, "snapshot");
    seed.objectStore("local-v1").put(localState);
    await seedCompletion;
    database.close();

    await expect(createBrowserTodoStorage(indexedDb).inspect()).resolves
      .toMatchObject({ code: "repository_corrupt", status: "fault" });
    const retainedDatabase = await requestResult(
      indexedDb.open(browserTodoDatabaseName, 1),
    );
    const read = retainedDatabase.transaction([
      "meta-v1",
      "remote-v1",
      "local-v1",
    ], "readonly");
    const readCompletion = transactionComplete(read);
    const [epoch, retainedSnapshot, retainedLocal] = await Promise.all([
      requestResult(read.objectStore("meta-v1").get("storage-epoch")),
      requestResult(read.objectStore("remote-v1").get("snapshot")),
      requestResult(read.objectStore("local-v1").get("todo-retained")),
    ]);

    await readCompletion;
    expect(epoch).toBe(3);
    expect(retainedSnapshot).toEqual(snapshot);
    expect(retainedLocal).toEqual(localState);
    retainedDatabase.close();
  });

  it("finishes an interrupted Browser Todo migration from v4 content", async () => {
    const indexedDb = new IDBFactory();
    const database = await openCurrentDatabase(
      indexedDb,
      browserTodoDatabaseName,
    );
    const content = migrateTodoV3Content(createTodoV3Content());
    const revision = await createVersionedContentRevision(
      serializeTodoRevisionContent(content),
    );
    const seed = database.transaction([
      "meta-v1",
      "remote-v1",
    ], "readwrite");
    const seedCompletion = transactionComplete(seed);

    seed.objectStore("meta-v1").put(3, "storage-epoch");
    seed.objectStore("remote-v1").put({ content, revision }, "snapshot");
    await seedCompletion;
    database.close();

    const storage = createBrowserTodoStorage(indexedDb);

    await expect(storage.backend.loadRemoteSnapshot()).resolves.toEqual({
      content,
      revision,
    });
  });

  it("preserves corrupt current content and a future epoch exactly", async () => {
    const indexedDb = new IDBFactory();
    const journalStorage = createBrowserJournalStorage(indexedDb);

    await expect(journalStorage.inspect()).resolves.toEqual({ status: "ready" });
    const journalDatabase = await requestResult(
      indexedDb.open(browserJournalDatabaseName, 1),
    );
    const invalidSnapshot = {
      content: { ...createEmptyJournalContent(), syntaxSource: "invalid" },
      revision: `sha256:${"c".repeat(64)}`,
    };
    const journalWrite = journalDatabase.transaction("remote-v1", "readwrite");
    const journalCompletion = transactionComplete(journalWrite);

    journalWrite.objectStore("remote-v1").put(invalidSnapshot, "snapshot");
    await journalCompletion;
    await expect(journalStorage.inspect()).resolves.toMatchObject({
      code: "repository_corrupt",
      status: "fault",
    });
    const journalRead = journalDatabase.transaction("remote-v1", "readonly");
    const journalReadCompletion = transactionComplete(journalRead);
    const retained = await requestResult(
      journalRead.objectStore("remote-v1").get("snapshot"),
    );

    await journalReadCompletion;
    expect(retained).toEqual(invalidSnapshot);
    journalDatabase.close();

    const todoDatabase = await openCurrentDatabase(indexedDb, browserTodoDatabaseName);
    const todoSeed = todoDatabase.transaction([
      "meta-v1",
      "remote-v1",
    ], "readwrite");
    const todoSeedCompletion = transactionComplete(todoSeed);
    const futureSnapshot = {
      content: createEmptyTodoContent(),
      revision: `sha256:${"d".repeat(64)}`,
    };

    todoSeed.objectStore("meta-v1").put(5, "storage-epoch");
    todoSeed.objectStore("remote-v1").put(futureSnapshot, "snapshot");
    await todoSeedCompletion;
    todoDatabase.close();
    await expect(createBrowserTodoStorage(indexedDb).inspect()).resolves
      .toMatchObject({
        code: "unsupported_repository_version",
        status: "fault",
      });
    const reopenedTodo = await requestResult(
      indexedDb.open(browserTodoDatabaseName, 1),
    );
    const todoRead = reopenedTodo.transaction([
      "meta-v1",
      "remote-v1",
    ], "readonly");
    const todoReadCompletion = transactionComplete(todoRead);
    const [epoch, snapshot] = await Promise.all([
      requestResult(todoRead.objectStore("meta-v1").get("storage-epoch")),
      requestResult(todoRead.objectStore("remote-v1").get("snapshot")),
    ]);

    await todoReadCompletion;
    expect(epoch).toBe(5);
    expect(snapshot).toEqual(futureSnapshot);
    reopenedTodo.close();
  });
});
