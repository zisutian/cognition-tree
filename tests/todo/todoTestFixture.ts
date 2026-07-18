// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createTodoCollection,
  createTodoItem,
} from "../../todo/commands/todoCommands";
import type {
  TodoCollectionId,
  TodoContent,
  TodoItemId,
} from "../../todo/model/todoContent";

export function todoCollectionId(index: number): TodoCollectionId {
  return `todo-collection-00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function todoItemId(index: number): TodoItemId {
  return `todo-item-00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function todoTimestamp(hour: number) {
  return `2026-07-18T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

export function createEmptyTodoContent(): TodoContent {
  return {
    collections: [],
    purpose: "system-todo",
    schemaVersion: 1,
  };
}

export function appendTodoTestCollection(
  content: TodoContent,
  {
    collectionIndex,
    createdAt = todoTimestamp(collectionIndex),
    name = `集合 ${collectionIndex}`,
  }: {
    collectionIndex: number;
    createdAt?: string;
    name?: string;
  },
) {
  return createTodoCollection(content, {
    collectionId: todoCollectionId(collectionIndex),
    createdAt,
    name,
  }).content;
}

export function appendTodoTestItem(
  content: TodoContent,
  {
    collectionIndex,
    createdAt,
    itemIndex,
    text = `任务 ${itemIndex}`,
  }: {
    collectionIndex: number;
    createdAt: string;
    itemIndex: number;
    text?: string;
  },
) {
  return createTodoItem(content, {
    collectionId: todoCollectionId(collectionIndex),
    createdAt,
    itemId: todoItemId(itemIndex),
    text,
  }).content;
}
