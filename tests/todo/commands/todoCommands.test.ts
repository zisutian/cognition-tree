// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  createTodoCollection,
  createTodoItem,
  deleteTodoCollection,
  deleteTodoItem,
  moveTodoCollection,
  moveTodoItem,
  renameTodoCollection,
  toggleTodoItem,
  updateTodoItemText,
} from "../../../todo/commands/todoCommands";
import { validateTodoContent } from "../../../todo/model/todoContent";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoCollectionId,
  todoItemId,
  todoTimestamp,
} from "../todoTestFixture";

function createCollectionWithTwoItems() {
  let content = appendTodoTestCollection(createEmptyTodoContent(), {
    collectionIndex: 1,
    createdAt: todoTimestamp(1),
  });
  content = appendTodoTestItem(content, {
    collectionIndex: 1,
    createdAt: todoTimestamp(2),
    itemIndex: 1,
  });
  content = appendTodoTestItem(content, {
    collectionIndex: 1,
    createdAt: todoTimestamp(3),
    itemIndex: 2,
  });
  return content;
}

describe("todo commands", () => {
  it("appends collections and normalizes inline names without mutating input", () => {
    const empty = createEmptyTodoContent();
    const created = createTodoCollection(empty, {
      collectionId: todoCollectionId(1),
      createdAt: todoTimestamp(1),
      name: "  工作  ",
    });
    const renamed = renameTodoCollection(created.content, {
      collectionId: created.collectionId,
      name: "  个人  ",
      updatedAt: todoTimestamp(2),
    });

    expect(empty.collections).toEqual([]);
    expect(created.content.collections[0]).toEqual({
      createdAt: todoTimestamp(1),
      id: todoCollectionId(1),
      items: [],
      name: "工作",
      updatedAt: todoTimestamp(1),
    });
    expect(renamed.collections[0]?.name).toBe("个人");
    expect(renamed.collections[0]?.updatedAt).toBe(todoTimestamp(2));
    expect(renameTodoCollection(renamed, {
      collectionId: todoCollectionId(1),
      name: "  个人 ",
      updatedAt: todoTimestamp(1),
    })).toBe(renamed);
    expect(() => createTodoCollection(empty, {
      collectionId: todoCollectionId(1),
      createdAt: todoTimestamp(1),
      name: "   ",
    })).toThrow(/name must not be empty/);
  });

  it("creates and edits items while preserving the user's exact non-empty text", () => {
    const content = appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
      createdAt: todoTimestamp(1),
    });
    const created = createTodoItem(content, {
      collectionId: todoCollectionId(1),
      createdAt: todoTimestamp(2),
      itemId: todoItemId(1),
      text: "  保留输入  ",
    });
    const updated = updateTodoItemText(created.content, {
      collectionId: todoCollectionId(1),
      itemId: todoItemId(1),
      text: " 修改后仍保留 ",
      updatedAt: todoTimestamp(3),
    });

    expect(created.content.collections[0]?.items[0]).toEqual({
      completed: false,
      completedAt: null,
      createdAt: todoTimestamp(2),
      id: todoItemId(1),
      text: "  保留输入  ",
      updatedAt: todoTimestamp(2),
    });
    expect(updated.collections[0]?.items[0]?.text).toBe(" 修改后仍保留 ");
    expect(updated.collections[0]?.updatedAt).toBe(todoTimestamp(3));
    expect(updateTodoItemText(updated, {
      collectionId: todoCollectionId(1),
      itemId: todoItemId(1),
      text: " 修改后仍保留 ",
      updatedAt: todoTimestamp(2),
    })).toBe(updated);
    expect(() => updateTodoItemText(updated, {
      collectionId: todoCollectionId(1),
      itemId: todoItemId(1),
      text: " \t ",
      updatedAt: todoTimestamp(4),
    })).toThrow(/text must not be empty/);
  });

  it("toggles completion in place and records one consistent completion fact", () => {
    const content = createCollectionWithTwoItems();
    const completed = toggleTodoItem(content, {
      collectionId: todoCollectionId(1),
      itemId: todoItemId(1),
      updatedAt: todoTimestamp(4),
    });
    const reopened = toggleTodoItem(completed, {
      collectionId: todoCollectionId(1),
      itemId: todoItemId(1),
      updatedAt: todoTimestamp(5),
    });

    expect(completed.collections[0]?.items.map(({ id }) => id)).toEqual([
      todoItemId(1),
      todoItemId(2),
    ]);
    expect(completed.collections[0]?.items[0]).toEqual(
      expect.objectContaining({
        completed: true,
        completedAt: todoTimestamp(4),
        updatedAt: todoTimestamp(4),
      }),
    );
    expect(reopened.collections[0]?.items[0]).toEqual(
      expect.objectContaining({
        completed: false,
        completedAt: null,
        updatedAt: todoTimestamp(5),
      }),
    );
    validateTodoContent(reopened);
  });

  it("reorders collections and items by stable id without rewriting item facts", () => {
    let content = createCollectionWithTwoItems();
    content = appendTodoTestCollection(content, {
      collectionIndex: 2,
      createdAt: todoTimestamp(4),
    });
    const movedCollections = moveTodoCollection(content, {
      collectionId: todoCollectionId(1),
      toIndex: 1,
    });
    const beforeItems = movedCollections.collections[1]!.items;
    const movedItems = moveTodoItem(movedCollections, {
      collectionId: todoCollectionId(1),
      itemId: todoItemId(1),
      toIndex: 1,
      updatedAt: todoTimestamp(5),
    });

    expect(movedCollections.collections.map(({ id }) => id)).toEqual([
      todoCollectionId(2),
      todoCollectionId(1),
    ]);
    expect(movedItems.collections[1]?.items.map(({ id }) => id)).toEqual([
      todoItemId(2),
      todoItemId(1),
    ]);
    expect(movedItems.collections[1]?.items[1]).toBe(beforeItems[0]);
    expect(movedItems.collections[1]?.updatedAt).toBe(todoTimestamp(5));
    expect(moveTodoCollection(movedCollections, {
      collectionId: todoCollectionId(1),
      toIndex: 1,
    })).toBe(movedCollections);
    expect(() => moveTodoItem(movedItems, {
      collectionId: todoCollectionId(1),
      itemId: todoItemId(1),
      toIndex: 2,
      updatedAt: todoTimestamp(6),
    })).toThrow(/out of bounds/);
  });

  it("deletes only the requested item or collection", () => {
    const content = createCollectionWithTwoItems();
    const withoutItem = deleteTodoItem(content, {
      collectionId: todoCollectionId(1),
      itemId: todoItemId(1),
      updatedAt: todoTimestamp(4),
    });
    const withoutCollection = deleteTodoCollection(
      withoutItem,
      todoCollectionId(1),
    );

    expect(withoutItem.collections[0]?.items.map(({ id }) => id)).toEqual([
      todoItemId(2),
    ]);
    expect(withoutItem.collections[0]?.updatedAt).toBe(todoTimestamp(4));
    expect(withoutCollection.collections).toEqual([]);
    expect(content.collections[0]?.items).toHaveLength(2);
    expect(() => deleteTodoItem(content, {
      collectionId: todoCollectionId(1),
      itemId: todoItemId(9),
      updatedAt: todoTimestamp(4),
    })).toThrow(/does not exist/);
  });

  it("rejects duplicate identities and every timestamped mutation that moves time backwards", () => {
    const content = createCollectionWithTwoItems();

    expect(() => createTodoCollection(content, {
      collectionId: todoCollectionId(1),
      createdAt: todoTimestamp(4),
      name: "重复",
    })).toThrow(/already exists/);
    expect(() => createTodoItem(content, {
      collectionId: todoCollectionId(1),
      createdAt: todoTimestamp(4),
      itemId: todoItemId(1),
      text: "重复",
    })).toThrow(/already exists/);
    expect(() => renameTodoCollection(content, {
      collectionId: todoCollectionId(1),
      name: "更早",
      updatedAt: todoTimestamp(2),
    })).toThrow(/cannot move backwards/);
    expect(() => createTodoItem(content, {
      collectionId: todoCollectionId(1),
      createdAt: todoTimestamp(2),
      itemId: todoItemId(3),
      text: "更早",
    })).toThrow(/cannot move backwards/);
    expect(() => updateTodoItemText(content, {
      collectionId: todoCollectionId(1),
      itemId: todoItemId(1),
      text: "更早",
      updatedAt: todoTimestamp(2),
    })).toThrow(/cannot move backwards/);
    expect(() => toggleTodoItem(content, {
      collectionId: todoCollectionId(1),
      itemId: todoItemId(1),
      updatedAt: todoTimestamp(2),
    })).toThrow(/cannot move backwards/);
    expect(() => deleteTodoItem(content, {
      collectionId: todoCollectionId(1),
      itemId: todoItemId(1),
      updatedAt: todoTimestamp(2),
    })).toThrow(/cannot move backwards/);
    expect(() => moveTodoItem(content, {
      collectionId: todoCollectionId(1),
      itemId: todoItemId(1),
      toIndex: 1,
      updatedAt: todoTimestamp(2),
    })).toThrow(/cannot move backwards/);
  });
});
