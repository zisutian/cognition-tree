import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createBrowserSystemRepositoryCatalog } from "../../../../src/storage/adapters/browser/browserSystemRepository";
import {
  browserSystemRepositoryDatabaseName,
  createBrowserSystemRepositoryStorage,
} from "../../../../src/storage/adapters/browser/browserSystemRepositoryStorage";
import {
  validateSystemRepositoryContent,
  validateSystemRepositoryTransition,
} from "../../../../src/storage/repository/systemRepository";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  updateJournalTestBody,
} from "../../../journal/journalTestFixture";
import { createEmptyTodoContent } from "../../../todo/todoTestFixture";

const remoteStoreName = "browser-remotes-v1";
const epochStoreName = "storage-epochs-v1";

function createStorage(
  indexedDb: IDBFactory,
  journalEpoch = 1,
  todoEpoch = 1,
) {
  return createBrowserSystemRepositoryStorage(indexedDb, {
    expectedEpochByPurpose: {
      "system-journal": journalEpoch,
      "system-todo": todoEpoch,
    },
    validateContent: validateSystemRepositoryContent,
    validateTransition: validateSystemRepositoryTransition,
  });
}

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

async function readRemote(indexedDb: IDBFactory, purpose: string) {
  const database = await requestResult(
    indexedDb.open(browserSystemRepositoryDatabaseName),
  );
  const transaction = database.transaction(remoteStoreName, "readonly");
  const completion = transactionComplete(transaction);
  const value = await requestResult(
    transaction.objectStore(remoteStoreName).get(purpose),
  );

  await completion;
  database.close();
  return value;
}

describe("browser system repository storage epochs", () => {
  it("atomically discards Todo v1 remote and local-first data at epoch 2", async () => {
    const indexedDb = new IDBFactory();
    const original = createStorage(indexedDb);
    const journalBefore = await original.createBackend("system-journal")
      .loadRemoteSnapshot();

    await original.createBackend("system-todo").loadRemoteSnapshot();
    const originalCatalog = createBrowserSystemRepositoryCatalog({
      storage: original,
    });

    await original.catalogCache.save(
      "todo-v1-catalog",
      await originalCatalog.listRepositories(),
    );
    const oldContent = {
      collections: [{
        createdAt: "2026-07-18T01:00:00.000Z",
        id: "todo-collection-00000000-0000-4000-8000-000000000001",
        items: [{ text: "永久丢弃的 v1 任务" }],
        name: "旧集合",
        updatedAt: "2026-07-18T01:00:00.000Z",
      }],
      purpose: "system-todo",
      schemaVersion: 1,
    };
    const revision = `sha256:${"a".repeat(64)}`;
    const browserIdentity = "browser-system:system-todo";
    const httpIdentity = "https://example.test#system:system-todo#v1";
    const database = await requestResult(
      indexedDb.open(browserSystemRepositoryDatabaseName),
    );
    const transaction = database.transaction(
      [remoteStoreName, "local-states-v1"],
      "readwrite",
    );
    const completion = transactionComplete(transaction);

    transaction.objectStore(remoteStoreName).put({
      content: oldContent,
      purpose: "system-todo",
      revision,
    });
    for (const [identity, suffix] of [
      [browserIdentity, "1"],
      [httpIdentity, "2"],
    ] as const) {
      transaction.objectStore("local-states-v1").put({
        content: oldContent,
        identity,
        localRevision:
          `draft:00000000-0000-4000-8000-00000000000${suffix}`,
        pendingBaseRevision: revision,
        remoteRevision: revision,
      });
    }
    await completion;
    database.close();

    const bumped = createStorage(indexedDb, 1, 2);
    const reset = await bumped.createBackend("system-todo")
      .loadRemoteSnapshot();

    expect(reset.content).toEqual(createEmptyTodoContent());
    await expect(bumped.cache.load(browserIdentity)).resolves.toBeNull();
    await expect(bumped.cache.load(httpIdentity)).resolves.toBeNull();
    await expect(bumped.catalogCache.load("todo-v1-catalog")).resolves.toBeNull();
    await expect(bumped.createBackend("system-journal").loadRemoteSnapshot())
      .resolves.toEqual(journalBefore);
    await expect(readRemote(indexedDb, "system-todo")).resolves.toMatchObject({
      content: createEmptyTodoContent(),
      purpose: "system-todo",
    });
  });

  it("atomically resets only the bumped purpose and clears its drafts and catalogs", async () => {
    const indexedDb = new IDBFactory();
    const original = createStorage(indexedDb);
    const journalBackend = original.createBackend("system-journal");
    const journalBase = await journalBackend.loadRemoteSnapshot();
    const committedContent = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const committed = await journalBackend.commitRemoteSnapshot({
      baseRevision: journalBase.revision,
      content: committedContent,
    });
    const browserIdentity = "browser-system:system-journal";
    const httpIdentity =
      "https://example.test#system:system-journal#cached-token";

    await original.cache.create({
      identity: browserIdentity,
      localRevision: "draft:00000000-0000-4000-8000-000000000001",
      snapshot: { content: committedContent, revision: committed.revision },
    });
    await original.cache.stage({
      content: updateJournalTestBody(committedContent, {
        body: "未同步草稿",
        entryIndex: 1,
        updatedAt: "2026-07-18T00:05:00.000Z",
      }),
      expectedLocalRevision: "draft:00000000-0000-4000-8000-000000000001",
      identity: browserIdentity,
      localRevision: "draft:00000000-0000-4000-8000-000000000002",
    });
    await original.cache.create({
      identity: httpIdentity,
      localRevision: "draft:00000000-0000-4000-8000-000000000003",
      snapshot: { content: committedContent, revision: committed.revision },
    });

    const todoSnapshot = await original.createBackend("system-todo")
      .loadRemoteSnapshot();
    const todoIdentity = "browser-system:system-todo";

    await original.cache.create({
      identity: todoIdentity,
      localRevision: "draft:00000000-0000-4000-8000-000000000004",
      snapshot: todoSnapshot,
    });
    const catalog = createBrowserSystemRepositoryCatalog({ storage: original });
    await original.catalogCache.save("test-catalog", await catalog.listRepositories());

    const bumped = createStorage(indexedDb, 2);
    const reset = await bumped.createBackend("system-journal")
      .loadRemoteSnapshot();

    expect(reset.content).toEqual(createEmptyJournalContent());
    await expect(bumped.cache.load(browserIdentity)).resolves.toBeNull();
    await expect(bumped.cache.load(httpIdentity)).resolves.toBeNull();
    await expect(bumped.cache.load(todoIdentity)).resolves.toMatchObject({
      content: { purpose: "system-todo" },
    });
    await expect(bumped.catalogCache.load("test-catalog")).resolves.toBeNull();
  });

  it("does not replace corrupt content when its stored epoch is current", async () => {
    const indexedDb = new IDBFactory();
    const original = createStorage(indexedDb);

    await original.createBackend("system-journal").loadRemoteSnapshot();
    const database = await requestResult(
      indexedDb.open(browserSystemRepositoryDatabaseName),
    );
    const corrupt = {
      content: {
        entries: [],
        purpose: "system-journal",
        schemaVersion: 99,
      },
      purpose: "system-journal",
      revision: `sha256:${"a".repeat(64)}`,
    };
    const transaction = database.transaction(remoteStoreName, "readwrite");
    const completion = transactionComplete(transaction);

    transaction.objectStore(remoteStoreName).put(corrupt);
    await completion;
    database.close();

    const reopened = createStorage(indexedDb);

    await expect(reopened.inspect("system-journal")).resolves.toMatchObject({
      code: "unsupported_repository_version",
      status: "fault",
    });
    await expect(readRemote(indexedDb, "system-journal")).resolves.toEqual(
      corrupt,
    );
  });

  it("preserves a future purpose epoch without disabling the other purpose", async () => {
    const indexedDb = new IDBFactory();
    const original = createStorage(indexedDb);

    await original.createBackend("system-journal").loadRemoteSnapshot();
    const todoBefore = await original.createBackend("system-todo")
      .loadRemoteSnapshot();
    const journalBefore = await readRemote(indexedDb, "system-journal");
    const database = await requestResult(
      indexedDb.open(browserSystemRepositoryDatabaseName),
    );
    const transaction = database.transaction(epochStoreName, "readwrite");
    const completion = transactionComplete(transaction);

    transaction.objectStore(epochStoreName).put({
      epoch: 2,
      purpose: "system-journal",
    });
    await completion;
    database.close();

    const reopened = createStorage(indexedDb);
    const catalog = createBrowserSystemRepositoryCatalog({ storage: reopened });

    await expect(catalog.listRepositories()).resolves.toMatchObject({
      issues: [{
        code: "unsupported_repository_version",
        id: "system-journal",
      }],
      repositories: [{ id: "system-todo" }],
    });
    await expect(readRemote(indexedDb, "system-journal")).resolves.toEqual(
      journalBefore,
    );
    await expect(reopened.createBackend("system-todo").loadRemoteSnapshot())
      .resolves.toEqual(todoBefore);
  });

  it("isolates a corrupt purpose epoch from the other purpose", async () => {
    const indexedDb = new IDBFactory();
    const original = createStorage(indexedDb);

    await original.createBackend("system-journal").loadRemoteSnapshot();
    await original.createBackend("system-todo").loadRemoteSnapshot();
    const database = await requestResult(
      indexedDb.open(browserSystemRepositoryDatabaseName),
    );
    const transaction = database.transaction(epochStoreName, "readwrite");
    const completion = transactionComplete(transaction);

    transaction.objectStore(epochStoreName).put({
      epoch: "broken",
      purpose: "system-journal",
    });
    await completion;
    database.close();

    const reopened = createStorage(indexedDb);
    const catalog = createBrowserSystemRepositoryCatalog({ storage: reopened });
    const projected = await catalog.listRepositories();

    expect(projected.issues).toMatchObject([{
      code: "repository_corrupt",
      id: "system-journal",
    }]);
    expect(projected.repositories).toMatchObject([{ id: "system-todo" }]);
    await expect(reopened.createBackend("system-todo").loadRemoteSnapshot())
      .resolves.toMatchObject({ content: { purpose: "system-todo" } });
  });
});
