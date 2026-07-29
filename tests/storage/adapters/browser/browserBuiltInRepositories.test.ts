// SPDX-License-Identifier: GPL-3.0-or-later

import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
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

  it("fails closed for noncurrent and partial storage without rewriting it", async () => {
    const noncurrentIndexedDb = new IDBFactory();
    const noncurrentDatabase = await openCurrentDatabase(
      noncurrentIndexedDb,
      browserTodoDatabaseName,
    );
    const noncurrentSnapshot = {
      content: { schemaVersion: 3 },
      revision: `sha256:${"a".repeat(64)}`,
    };
    const noncurrentLocal = { identity: "retained", opaque: true };
    const noncurrentWrite = noncurrentDatabase.transaction(
      ["meta-v1", "remote-v1", "local-v1"],
      "readwrite",
    );
    const noncurrentCompletion = transactionComplete(noncurrentWrite);

    noncurrentWrite.objectStore("meta-v1").put(3, "storage-epoch");
    noncurrentWrite.objectStore("remote-v1").put(
      noncurrentSnapshot,
      "snapshot",
    );
    noncurrentWrite.objectStore("local-v1").put(noncurrentLocal);
    await noncurrentCompletion;
    noncurrentDatabase.close();

    await expect(createBrowserTodoStorage(noncurrentIndexedDb).inspect())
      .resolves.toMatchObject({
        code: "unsupported_repository_version",
        status: "fault",
      });
    const retainedNoncurrent = await requestResult(
      noncurrentIndexedDb.open(browserTodoDatabaseName, 1),
    );
    const noncurrentRead = retainedNoncurrent.transaction(
      ["meta-v1", "remote-v1", "local-v1"],
      "readonly",
    );
    const noncurrentReadCompletion = transactionComplete(noncurrentRead);

    await expect(Promise.all([
      requestResult(noncurrentRead.objectStore("meta-v1").get("storage-epoch")),
      requestResult(noncurrentRead.objectStore("remote-v1").get("snapshot")),
      requestResult(noncurrentRead.objectStore("local-v1").get("retained")),
    ])).resolves.toEqual([3, noncurrentSnapshot, noncurrentLocal]);
    await noncurrentReadCompletion;
    retainedNoncurrent.close();

    const partialIndexedDb = new IDBFactory();
    const partialDatabase = await openCurrentDatabase(
      partialIndexedDb,
      browserTodoDatabaseName,
    );
    const partialSnapshot = {
      content: createEmptyTodoContent(),
      revision: `sha256:${"b".repeat(64)}`,
    };
    const partialWrite = partialDatabase.transaction(
      "remote-v1",
      "readwrite",
    );
    const partialCompletion = transactionComplete(partialWrite);

    partialWrite.objectStore("remote-v1").put(partialSnapshot, "snapshot");
    await partialCompletion;
    partialDatabase.close();
    await expect(createBrowserTodoStorage(partialIndexedDb).inspect())
      .resolves.toMatchObject({
        code: "repository_corrupt",
        status: "fault",
      });
    const retainedPartial = await requestResult(
      partialIndexedDb.open(browserTodoDatabaseName, 1),
    );
    const partialRead = retainedPartial.transaction(
      ["meta-v1", "remote-v1"],
      "readonly",
    );
    const partialReadCompletion = transactionComplete(partialRead);

    await expect(Promise.all([
      requestResult(partialRead.objectStore("meta-v1").get("storage-epoch")),
      requestResult(partialRead.objectStore("remote-v1").get("snapshot")),
    ])).resolves.toEqual([undefined, partialSnapshot]);
    await partialReadCompletion;
    retainedPartial.close();

    const missingContentIndexedDb = new IDBFactory();
    const missingContentDatabase = await openCurrentDatabase(
      missingContentIndexedDb,
      browserJournalDatabaseName,
    );
    const missingContentWrite = missingContentDatabase.transaction(
      "meta-v1",
      "readwrite",
    );
    const missingContentCompletion = transactionComplete(missingContentWrite);

    missingContentWrite.objectStore("meta-v1").put(3, "storage-epoch");
    await missingContentCompletion;
    missingContentDatabase.close();
    await expect(createBrowserJournalStorage(missingContentIndexedDb).inspect())
      .resolves.toMatchObject({
        code: "repository_corrupt",
        status: "fault",
      });
    const retainedMissingContent = await requestResult(
      missingContentIndexedDb.open(browserJournalDatabaseName, 1),
    );
    const missingContentRead = retainedMissingContent.transaction(
      ["meta-v1", "remote-v1"],
      "readonly",
    );
    const missingContentReadCompletion = transactionComplete(
      missingContentRead,
    );

    await expect(Promise.all([
      requestResult(
        missingContentRead.objectStore("meta-v1").get("storage-epoch"),
      ),
      requestResult(
        missingContentRead.objectStore("remote-v1").get("snapshot"),
      ),
    ])).resolves.toEqual([3, undefined]);
    await missingContentReadCompletion;
    retainedMissingContent.close();
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
