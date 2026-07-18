// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createTodoCollection,
  createTodoItem,
  toggleTodoItem,
} from "../../../todo/commands/todoCommands";
import type {
  TodoCollectionId,
  TodoContent,
  TodoItemId,
} from "../../../todo/model/todoContent";
import {
  createTodoViewModel,
  getTodoPersistenceErrorMessage,
} from "../../../src/application/todo/todoViewModel";
import type { TodoMutationActions } from "../../../src/application/todo/todoApplication";

const collectionOne =
  "todo-collection-00000000-0000-4000-8000-000000000001" as TodoCollectionId;
const collectionTwo =
  "todo-collection-00000000-0000-4000-8000-000000000002" as TodoCollectionId;
const itemOne =
  "todo-item-00000000-0000-4000-8000-000000000001" as TodoItemId;
const itemTwo =
  "todo-item-00000000-0000-4000-8000-000000000002" as TodoItemId;

function createContent() {
  let content: TodoContent = {
    collections: [],
    purpose: "system-todo",
    schemaVersion: 1,
  };
  content = createTodoCollection(content, {
    collectionId: collectionOne,
    createdAt: "2026-07-18T01:00:00.000Z",
    name: "第一组",
  }).content;
  content = createTodoItem(content, {
    collectionId: collectionOne,
    createdAt: "2026-07-18T02:00:00.000Z",
    itemId: itemOne,
    text: "已完成但保持原位",
  }).content;
  content = createTodoItem(content, {
    collectionId: collectionOne,
    createdAt: "2026-07-18T03:00:00.000Z",
    itemId: itemTwo,
    text: "未完成",
  }).content;
  content = toggleTodoItem(content, {
    collectionId: collectionOne,
    itemId: itemOne,
    updatedAt: "2026-07-18T04:00:00.000Z",
  });
  return createTodoCollection(content, {
    collectionId: collectionTwo,
    createdAt: "2026-07-18T05:00:00.000Z",
    name: "第二组",
  }).content;
}

function createActions() {
  return {
    createCollection: vi.fn(() => collectionTwo),
    createItem: vi.fn(() => itemTwo),
    deleteCollection: vi.fn(() => collectionOne),
    deleteItem: vi.fn(),
    moveCollection: vi.fn(),
    moveItem: vi.fn(),
    renameCollection: vi.fn(),
    toggleItem: vi.fn(),
    updateItemText: vi.fn(),
  } satisfies TodoMutationActions;
}

describe("todo view model", () => {
  it("projects stored collection and item order without moving completed items", () => {
    const content = createContent();
    const actions = createActions();
    const selectCollection = vi.fn();
    const view = createTodoViewModel({
      activeCollectionId: collectionOne,
      content,
      ...actions,
      persistence: { status: "saved" },
      selectCollection,
    });

    expect(view.collections).toEqual([
      expect.objectContaining({
        completedItemCount: 1,
        id: collectionOne,
        isActive: true,
        itemCount: 2,
        name: "第一组",
      }),
      expect.objectContaining({
        completedItemCount: 0,
        id: collectionTwo,
        isActive: false,
        itemCount: 0,
        name: "第二组",
      }),
    ]);
    expect(view.activeCollection).toMatchObject({
      id: collectionOne,
      name: "第一组",
    });
    expect(view.items.map(({ completed, id, text }) => ({
      completed,
      id,
      text,
    }))).toEqual([
      {
        completed: true,
        id: itemOne,
        text: "已完成但保持原位",
      },
      { completed: false, id: itemTwo, text: "未完成" },
    ]);
    expect(view.persistenceErrorMessage).toBe("");

    view.selectCollection(collectionTwo);
    view.createItem(collectionOne, "新任务");
    view.moveItem(collectionOne, itemTwo, 0);
    expect(selectCollection).toHaveBeenCalledWith(collectionTwo);
    expect(actions.createItem).toHaveBeenCalledWith(collectionOne, "新任务");
    expect(actions.moveItem).toHaveBeenCalledWith(collectionOne, itemTwo, 0);
  });

  it("projects an empty Todo repository without inventing a collection", () => {
    const actions = createActions();
    const view = createTodoViewModel({
      activeCollectionId: null,
      content: {
        collections: [],
        purpose: "system-todo",
        schemaVersion: 1,
      },
      ...actions,
      persistence: { status: "saved" },
      selectCollection: vi.fn(),
    });

    expect(view.activeCollection).toBeNull();
    expect(view.collections).toEqual([]);
    expect(view.items).toEqual([]);
  });

  it("shows persistence failures and conflicts without inventing Todo diagnostics", () => {
    expect(getTodoPersistenceErrorMessage({
      localCopySafe: true,
      message: "本地保存失败",
      phase: "local",
      status: "error",
    })).toBe("本地保存失败");
    expect(getTodoPersistenceErrorMessage({
      remoteRevision: `sha256:${"a".repeat(64)}`,
      status: "conflict",
    })).toBe("代办存在同步冲突，请前往仓库处理。");
    expect(getTodoPersistenceErrorMessage({ status: "pending-sync" })).toBe("");
  });
});
