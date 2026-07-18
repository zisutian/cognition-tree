// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type {
  TodoCollectionId,
  TodoContent,
  TodoItemId,
} from "../../../todo/model/todoContent";
import {
  createBrowserTodoApplicationServices,
  createTodoMutationActions,
  requireTodoContent,
  resolveRequestedTodoSelectionAfterDelete,
  type TodoApplicationServices,
  type TodoDeleteCollectionMutationResult,
} from "../../../src/application/todo/todoApplication";
import type { SystemRepositoryContent } from "../../../src/storage/repository/systemRepository";

function collectionId(index: number): TodoCollectionId {
  return `todo-collection-00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function itemId(index: number): TodoItemId {
  return `todo-item-00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function createEmptyContent(): TodoContent {
  return {
    collections: [],
    purpose: "system-todo",
    schemaVersion: 1,
  };
}

function createServices({
  collectionIds,
  itemIds,
  timestamps,
}: {
  collectionIds: TodoCollectionId[];
  itemIds: TodoItemId[];
  timestamps: string[];
}) {
  let collectionIndex = 0;
  let itemIndex = 0;
  let timestampIndex = 0;

  return {
    createCollectionId: () => {
      const id = collectionIds[collectionIndex++];

      if (!id) throw new Error("Missing test todo collection id.");
      return id;
    },
    createItemId: () => {
      const id = itemIds[itemIndex++];

      if (!id) throw new Error("Missing test todo item id.");
      return id;
    },
    now: () => {
      const timestamp = timestamps[timestampIndex++];

      if (!timestamp) throw new Error("Missing test todo timestamp.");
      return new Date(timestamp);
    },
  } satisfies TodoApplicationServices;
}

function createFunctionalSession(initial: TodoContent) {
  let content: SystemRepositoryContent = initial;
  const visibleStates: string[] = [];

  return {
    get content() {
      return requireTodoContent(content);
    },
    session: {
      updateContent(
        update: (current: SystemRepositoryContent) => SystemRepositoryContent,
      ) {
        content = update(content);
        visibleStates.push(JSON.stringify(content));
      },
    },
    visibleStates,
  };
}

describe("todo application mutations", () => {
  it("uses functional session updates so consecutive collection and item operations cannot lose data", () => {
    const harness = createFunctionalSession(createEmptyContent());
    const createdCollections: TodoCollectionId[] = [];
    const actions = createTodoMutationActions({
      onCollectionCreated: (id) => createdCollections.push(id),
      onCollectionDeleted: () => undefined,
      services: createServices({
        collectionIds: [collectionId(1), collectionId(2)],
        itemIds: [itemId(1), itemId(2)],
        timestamps: [
          "2026-07-18T01:00:00.000Z",
          "2026-07-18T02:00:00.000Z",
          "2026-07-18T03:00:00.000Z",
          "2026-07-18T04:00:00.000Z",
          "2026-07-18T05:00:00.000Z",
          "2026-07-18T06:00:00.000Z",
          "2026-07-18T07:00:00.000Z",
          "2026-07-18T08:00:00.000Z",
        ],
      }),
      session: harness.session,
    });

    actions.createCollection("收集箱");
    actions.createCollection("稍后");
    actions.createItem(collectionId(1), "第一项");
    actions.createItem(collectionId(1), "第二项");
    actions.updateItemText(collectionId(1), itemId(1), "第一项已修改");
    actions.toggleItem(collectionId(1), itemId(2));
    actions.moveItem(collectionId(1), itemId(2), 0);
    actions.renameCollection(collectionId(2), "计划");
    actions.moveCollection(collectionId(2), 0);

    expect(createdCollections).toEqual([collectionId(1), collectionId(2)]);
    expect(harness.visibleStates).toHaveLength(9);
    expect(harness.content.collections.map(({ id, name }) => ({ id, name })))
      .toEqual([
        { id: collectionId(2), name: "计划" },
        { id: collectionId(1), name: "收集箱" },
      ]);
    expect(harness.content.collections[1]?.items.map((item) => ({
      completed: item.completed,
      id: item.id,
      text: item.text,
    }))).toEqual([
      { completed: true, id: itemId(2), text: "第二项" },
      { completed: false, id: itemId(1), text: "第一项已修改" },
    ]);
  });

  it("selects a created collection and resolves the following then previous neighbor after deletion", () => {
    const harness = createFunctionalSession(createEmptyContent());
    let requestedCollectionId: TodoCollectionId | null = null;
    const deleteResults: TodoDeleteCollectionMutationResult[] = [];
    const actions = createTodoMutationActions({
      onCollectionCreated: (id) => {
        requestedCollectionId = id;
      },
      onCollectionDeleted: (result) => {
        deleteResults.push(result);
        requestedCollectionId = resolveRequestedTodoSelectionAfterDelete({
          ...result,
          requestedCollectionId,
        });
      },
      services: createServices({
        collectionIds: [collectionId(1), collectionId(2), collectionId(3)],
        itemIds: [],
        timestamps: [
          "2026-07-18T01:00:00.000Z",
          "2026-07-18T02:00:00.000Z",
          "2026-07-18T03:00:00.000Z",
        ],
      }),
      session: harness.session,
    });

    actions.createCollection("一");
    actions.createCollection("二");
    actions.createCollection("三");
    expect(requestedCollectionId).toBe(collectionId(3));

    requestedCollectionId = collectionId(2);
    expect(actions.deleteCollection(collectionId(2))).toBe(collectionId(3));
    expect(requestedCollectionId).toBe(collectionId(3));

    expect(actions.deleteCollection(collectionId(3))).toBe(collectionId(1));
    expect(requestedCollectionId).toBe(collectionId(1));
    expect(deleteResults).toHaveLength(2);
  });

  it("keeps another requested collection stable when a non-selected one is deleted", () => {
    const harness = createFunctionalSession(createEmptyContent());
    let requestedCollectionId: TodoCollectionId | null = null;
    const actions = createTodoMutationActions({
      onCollectionCreated: (id) => {
        requestedCollectionId = id;
      },
      onCollectionDeleted: (result) => {
        requestedCollectionId = resolveRequestedTodoSelectionAfterDelete({
          ...result,
          requestedCollectionId,
        });
      },
      services: createServices({
        collectionIds: [collectionId(1), collectionId(2)],
        itemIds: [],
        timestamps: [
          "2026-07-18T01:00:00.000Z",
          "2026-07-18T02:00:00.000Z",
        ],
      }),
      session: harness.session,
    });

    actions.createCollection("一");
    actions.createCollection("二");
    requestedCollectionId = collectionId(2);
    actions.deleteCollection(collectionId(1));

    expect(requestedCollectionId).toBe(collectionId(2));
  });

  it("clamps all timestamped mutations when the browser clock moves backwards", () => {
    const harness = createFunctionalSession(createEmptyContent());
    const actions = createTodoMutationActions({
      onCollectionCreated: () => undefined,
      onCollectionDeleted: () => undefined,
      services: createServices({
        collectionIds: [collectionId(1), collectionId(2)],
        itemIds: [itemId(1), itemId(2)],
        timestamps: [
          "2026-07-18T10:00:00.000Z",
          "2026-07-18T05:00:00.000Z",
          "2026-07-18T04:00:00.000Z",
          "2026-07-18T03:00:00.000Z",
          "2026-07-18T02:00:00.000Z",
          "2026-07-18T01:00:00.000Z",
          "2026-07-18T00:00:00.000Z",
          "2026-07-17T23:00:00.000Z",
        ],
      }),
      session: harness.session,
    });

    actions.createCollection("一");
    actions.renameCollection(collectionId(1), "已重命名");
    actions.createItem(collectionId(1), "第一项");
    actions.updateItemText(collectionId(1), itemId(1), "已修改");
    actions.toggleItem(collectionId(1), itemId(1));
    actions.createItem(collectionId(1), "第二项");
    actions.moveItem(collectionId(1), itemId(2), 0);
    actions.createCollection("二");

    const [first, second] = harness.content.collections;

    expect(first?.createdAt).toBe("2026-07-18T10:00:00.000Z");
    expect(first?.updatedAt).toBe("2026-07-18T10:00:00.000Z");
    expect(first?.items.map(({ completedAt, createdAt, updatedAt }) => ({
      completedAt,
      createdAt,
      updatedAt,
    }))).toEqual([
      {
        completedAt: null,
        createdAt: "2026-07-18T10:00:00.000Z",
        updatedAt: "2026-07-18T10:00:00.000Z",
      },
      {
        completedAt: "2026-07-18T10:00:00.000Z",
        createdAt: "2026-07-18T10:00:00.000Z",
        updatedAt: "2026-07-18T10:00:00.000Z",
      },
    ]);
    expect(second?.createdAt).toBe("2026-07-18T10:00:00.000Z");
  });

  it("deletes items through a functional update and preserves the remaining order", () => {
    const harness = createFunctionalSession(createEmptyContent());
    const actions = createTodoMutationActions({
      onCollectionCreated: () => undefined,
      onCollectionDeleted: () => undefined,
      services: createServices({
        collectionIds: [collectionId(1)],
        itemIds: [itemId(1), itemId(2)],
        timestamps: [
          "2026-07-18T01:00:00.000Z",
          "2026-07-18T02:00:00.000Z",
          "2026-07-18T03:00:00.000Z",
          "2026-07-18T04:00:00.000Z",
        ],
      }),
      session: harness.session,
    });

    actions.createCollection("集合");
    actions.createItem(collectionId(1), "保留");
    actions.createItem(collectionId(1), "删除");
    actions.deleteItem(collectionId(1), itemId(2));

    expect(harness.content.collections[0]?.items.map(({ id }) => id)).toEqual([
      itemId(1),
    ]);
    expect(harness.content.collections[0]?.updatedAt).toBe(
      "2026-07-18T04:00:00.000Z",
    );
  });

  it("rejects non-todo system content and invalid application clocks", () => {
    expect(() => requireTodoContent({
      entries: [],
      purpose: "system-journal",
      schemaVersion: 1,
    })).toThrow("received non-todo content");

    const actions = createTodoMutationActions({
      onCollectionCreated: () => undefined,
      onCollectionDeleted: () => undefined,
      services: {
        createCollectionId: () => collectionId(1),
        createItemId: () => itemId(1),
        now: () => new Date(Number.NaN),
      },
      session: createFunctionalSession(createEmptyContent()).session,
    });

    expect(() => actions.createCollection("集合")).toThrow(
      "time source returned an invalid date",
    );
  });

  it("provides browser UUID and clock services with the Todo prefixes", () => {
    const services = createBrowserTodoApplicationServices();

    expect(services.createCollectionId()).toMatch(
      /^todo-collection-[0-9a-f-]{36}$/,
    );
    expect(services.createItemId()).toMatch(/^todo-item-[0-9a-f-]{36}$/);
    expect(services.now()).toBeInstanceOf(Date);
  });
});
