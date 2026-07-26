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

    todoSeed.objectStore("meta-v1").put(4, "storage-epoch");
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
    expect(epoch).toBe(4);
    expect(snapshot).toEqual(futureSnapshot);
    reopenedTodo.close();
  });
});
