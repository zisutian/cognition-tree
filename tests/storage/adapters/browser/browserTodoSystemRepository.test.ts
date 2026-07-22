// SPDX-License-Identifier: GPL-3.0-or-later

import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  createSystemRepositorySessionController,
} from "../../../../src/application/repository/systemRepositorySessionController";
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
  toggleTodoBlock,
  updateTodoCollectionBody,
} from "../../../../core/todo/commands/todoCommands";
import {
  createTodoCollectionBodyProjection,
  validateTodoContent,
} from "../../../../core/todo/model/todoContent";
import { requireTodoSyntaxProfile } from "../../../../core/todo/syntax/todoSyntax";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
} from "../../../todo/todoTestFixture";

const localStoreName = "local-states-v1";
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

function createStorage(indexedDb: IDBFactory) {
  return createBrowserSystemRepositoryStorage(indexedDb, {
    validateContent: validateSystemRepositoryContent,
    validateTransition: validateSystemRepositoryTransition,
  });
}

function createTodoContent() {
  return appendTodoTestItem(
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
}

function editTodoContent(
  content: ReturnType<typeof createTodoContent>,
  updatedAt = todoTimestamp(3),
) {
  const collection = content.collections[0]!;
  const projection = createTodoCollectionBodyProjection(
    collection,
    requireTodoSyntaxProfile(content.syntaxSource),
  );
  const from = projection.source.indexOf("任务 1");

  return updateTodoCollectionBody(content, {
    change: {
      edits: [{ from, insertedText: "更新", to: from + "任务 1".length }],
      source: projection.source.replace("任务 1", "更新"),
    },
    collectionId: todoCollectionId(1),
    createBlockId: () => todoBlockId(99),
    updatedAt,
  });
}

describe("Browser Todo system repository", () => {
  it("syncs a completed item reopened and recompleted inside one debounce window", async () => {
    const indexedDb = new IDBFactory();
    const storage = createStorage(indexedDb);
    const backend = storage.createBackend("system-todo");
    const initialRemote = await backend.loadRemoteSnapshot();
    const incomplete = createTodoContent();
    const completed = toggleTodoBlock(incomplete, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completedAt: todoTimestamp(3),
    });

    await backend.commitRemoteSnapshot({
      baseRevision: initialRemote.revision,
      content: completed,
    });

    const catalog = createBrowserSystemRepositoryCatalog({ storage });
    const projection = await catalog.listRepositories();
    const descriptor = projection.repositories.find(({ id }) =>
      id === "system-todo"
    )!;
    const controller = createSystemRepositorySessionController({
      purpose: "system-todo",
      repository: catalog.openRepository(descriptor),
    });
    const toggleAt = (updatedAt: string) => {
      controller.updateContent((current) => {
        if (current.purpose !== "system-todo") {
          throw new Error("Expected Todo content.");
        }
        const todo = validateTodoContent(current);
        const currentCollection = todo.collections[0]!;

        return toggleTodoBlock(todo, {
          blockId: todoBlockId(1),
          collectionId: currentCollection.id,
          completedAt: updatedAt,
        });
      });
    };

    controller.start();
    try {
      await vi.waitFor(() => {
        expect(controller.getState().status).toBe("ready");
      });

      toggleAt(todoTimestamp(4));
      toggleAt(todoTimestamp(5));
      await controller.flushPendingChanges();

      await vi.waitFor(() => {
        const state = controller.getState();

        expect(state.status).toBe("ready");
        expect(state.status === "ready" ? state.persistence.status : null).toBe(
          "saved",
        );
      }, { timeout: 2_000 });
      const remote = await backend.loadRemoteSnapshot();

      expect(remote.content.purpose).toBe("system-todo");
      expect(remote.content.purpose === "system-todo"
        ? remote.content.collections[0]?.completions
        : null).toEqual([{
          blockId: todoBlockId(1),
          completedAt: todoTimestamp(5),
        }]);
    } finally {
      controller.stop();
    }
  });

  it("rejects invalid forward remote transitions without overwriting IndexedDB", async () => {
    const indexedDb = new IDBFactory();
    const storage = createStorage(indexedDb);
    const backend = storage.createBackend("system-todo");
    const initial = await backend.loadRemoteSnapshot();
    const valid = createTodoContent();
    const committed = await backend.commitRemoteSnapshot({
      baseRevision: initial.revision,
      content: valid,
    });
    const tampered = {
      ...valid,
      collections: [{
        ...valid.collections[0]!,
        source: valid.collections[0]!.source.replace(
          `id=${todoBlockId(10_001)} created=${todoTimestamp(1)}`,
          `id=${todoBlockId(10_001)} created=${todoTimestamp(0)}`,
        ),
      }],
    };
    const database = await openDatabase(indexedDb);
    const beforeTransaction = database.transaction(remoteStoreName, "readonly");
    const beforeCompletion = transactionComplete(beforeTransaction);
    const before = await requestResult(
      beforeTransaction.objectStore(remoteStoreName).get("system-todo"),
    );

    await beforeCompletion;
    await expect(backend.commitRemoteSnapshot({
      baseRevision: committed.revision,
      content: tampered,
    })).rejects.toThrow(/createdAt is immutable/);
    const afterTransaction = database.transaction(remoteStoreName, "readonly");
    const afterCompletion = transactionComplete(afterTransaction);
    const after = await requestResult(
      afterTransaction.objectStore(remoteStoreName).get("system-todo"),
    );

    await afterCompletion;
    expect(after).toEqual(before);
    await expect(backend.loadRemoteSnapshot()).resolves.toMatchObject({
      content: valid,
      revision: committed.revision,
    });
    database.close();
  });

  it("keeps the prior local draft when staging violates Todo transition rules", async () => {
    const indexedDb = new IDBFactory();
    const storage = createStorage(indexedDb);
    const catalog = createBrowserSystemRepositoryCatalog({ storage });
    const projection = await catalog.listRepositories();
    const descriptor = projection.repositories.find(({ id }) =>
      id === "system-todo"
    )!;
    const repository = catalog.openRepository(descriptor);
    const initial = await repository.loadSnapshot();
    const valid = createTodoContent();
    const staged = await repository.stageSnapshot({
      content: valid,
      expectedLocalRevision: initial.localRevision,
    });
    const invalid = {
      ...valid,
      collections: [{
        ...valid.collections[0]!,
        source: valid.collections[0]!.source.replace(
          `id=${todoBlockId(1)} created=${todoTimestamp(2)} updated=${todoTimestamp(2)}`,
          `id=${todoBlockId(1)} created=${todoTimestamp(3)} updated=${todoTimestamp(3)}`,
        ),
      }],
    };

    await expect(repository.stageSnapshot({
      content: invalid,
      expectedLocalRevision: staged.localRevision,
    })).rejects.toThrow(/createdAt is immutable/);
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: valid,
      localRevision: staged.localRevision,
      pendingChanges: true,
    });
  });

  it("lets explicit discard restore an older valid remote snapshot", async () => {
    const indexedDb = new IDBFactory();
    const storage = createStorage(indexedDb);
    const backend = storage.createBackend("system-todo");
    const initialRemote = await backend.loadRemoteSnapshot();
    const valid = createTodoContent();

    await backend.commitRemoteSnapshot({
      baseRevision: initialRemote.revision,
      content: valid,
    });
    const catalog = createBrowserSystemRepositoryCatalog({ storage });
    const projection = await catalog.listRepositories();
    const descriptor = projection.repositories.find(({ id }) =>
      id === "system-todo"
    )!;
    const repository = catalog.openRepository(descriptor);
    const loaded = await repository.loadSnapshot();
    const edited = editTodoContent(valid);

    await repository.stageSnapshot({
      content: edited,
      expectedLocalRevision: loaded.localRevision,
    });
    await expect(repository.discardPendingSnapshotAndReload()).resolves
      .toMatchObject({
        content: valid,
        pendingChanges: false,
      });
  });

  it("retains semantically corrupt Todo remote and local cache values", async () => {
    const indexedDb = new IDBFactory();
    const storage = createStorage(indexedDb);
    const catalog = createBrowserSystemRepositoryCatalog({ storage });
    const projection = await catalog.listRepositories();
    const descriptor = projection.repositories.find(({ id }) =>
      id === "system-todo"
    )!;
    const repository = catalog.openRepository(descriptor);
    const local = await repository.loadSnapshot();
    const database = await openDatabase(indexedDb);
    const invalidContent = {
      ...createTodoContent(),
      collections: [{
        ...createTodoContent().collections[0]!,
        completions: [{
          blockId: todoBlockId(99),
          completedAt: todoTimestamp(3),
        }],
      }],
    };
    const remoteRead = database.transaction(remoteStoreName, "readonly");
    const remoteReadCompletion = transactionComplete(remoteRead);
    const currentRemote = await requestResult(
      remoteRead.objectStore(remoteStoreName).get("system-todo"),
    ) as Record<string, unknown>;

    await remoteReadCompletion;
    const corruptRemote = { ...currentRemote, content: invalidContent };
    const remoteWrite = database.transaction(remoteStoreName, "readwrite");
    const remoteWriteCompletion = transactionComplete(remoteWrite);

    remoteWrite.objectStore(remoteStoreName).put(corruptRemote);
    await remoteWriteCompletion;
    await expect(catalog.listRepositories()).resolves.toMatchObject({
      issues: [expect.objectContaining({ id: "system-todo" })],
    });
    const retainedRemoteRead = database.transaction(remoteStoreName, "readonly");
    const retainedRemoteCompletion = transactionComplete(retainedRemoteRead);
    const retainedRemote = await requestResult(
      retainedRemoteRead.objectStore(remoteStoreName).get("system-todo"),
    );

    await retainedRemoteCompletion;
    expect(retainedRemote).toEqual(corruptRemote);

    const corruptLocal = {
      content: invalidContent,
      identity: "browser-system:system-todo",
      localRevision: local.localRevision,
      pendingBaseRevision: null,
      remoteRevision: local.remoteRevision,
    };
    const localWrite = database.transaction(localStoreName, "readwrite");
    const localWriteCompletion = transactionComplete(localWrite);

    localWrite.objectStore(localStoreName).put(corruptLocal);
    await localWriteCompletion;
    await expect(repository.loadSnapshot()).rejects.toThrow(
      /does not identify a source block/,
    );
    const retainedLocalRead = database.transaction(localStoreName, "readonly");
    const retainedLocalCompletion = transactionComplete(retainedLocalRead);
    const retainedLocal = await requestResult(
      retainedLocalRead.objectStore(localStoreName).get(
        "browser-system:system-todo",
      ),
    );

    await retainedLocalCompletion;
    expect(retainedLocal).toEqual(corruptLocal);
    database.close();
  });
});
