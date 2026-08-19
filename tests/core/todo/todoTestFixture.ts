// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createTodoCollection,
  updateTodoCollectionBody,
} from "../../../core/todo/commands/todoCommands";
import {
  createTodoCollectionBodyProjection,
  type TodoCollectionId,
  type TodoContent,
} from "../../../core/todo/model/todoContent";
import {
  defaultTodoSyntaxSource,
} from "../../../core/todo/syntax/defaultTodoSyntax";
import {
  createTodoParseIndex,
} from "../../../core/todo/indexes/todoParseIndex";

export function todoCollectionId(index: number): TodoCollectionId {
  return `todo-collection-00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function todoBlockId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export const todoItemId = todoBlockId;

export function todoTimestamp(hour: number) {
  return `2026-07-18T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

export function createEmptyTodoContent(): TodoContent {
  return {
    collections: [],
    schemaVersion: 4,
    syntaxSource: defaultTodoSyntaxSource,
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
  return createTodoCollection(
    content,
    createTodoParseIndex(content),
    {
      collectionId: todoCollectionId(collectionIndex),
      createBlockId: () => todoBlockId(10_000 + collectionIndex),
      createdAt,
      name,
    },
  ).content;
}

export function appendTodoTestItem(
  content: TodoContent,
  {
    collectionIndex,
    createdAt,
    itemIndex,
    text = `任务 ${itemIndex}`,
    level = 0,
  }: {
    collectionIndex: number;
    createdAt: string;
    itemIndex: number;
    level?: number;
    text?: string;
  },
) {
  const collectionId = todoCollectionId(collectionIndex);
  const collection = content.collections.find(({ id }) => id === collectionId);

  if (!collection) throw new Error(`Missing test Todo collection ${collectionId}`);
  const projection = createTodoCollectionBodyProjection(
    createTodoParseIndex(content).getParsedCollection(collectionId)!,
  );
  const insertedText = `${projection.source ? "\n" : ""}${"\t".repeat(level)}[] ${text}`;
  const source = `${projection.source}${insertedText}`;

  return updateTodoCollectionBody(
    content,
    createTodoParseIndex(content),
    {
    change: {
      edits: [{
        from: projection.source.length,
        insertedText,
        to: projection.source.length,
      }],
      source,
    },
    collectionId,
    createBlockId: () => todoBlockId(itemIndex),
    updatedAt: createdAt,
    },
  ).content;
}
