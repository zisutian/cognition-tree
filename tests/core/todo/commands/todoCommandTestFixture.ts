// SPDX-License-Identifier: GPL-3.0-or-later

import {
  moveTodoBlock,
} from "../../../../core/todo/commands/todoBlockCommands";
import {
  renameTodoCollection,
} from "../../../../core/todo/commands/todoCollectionCommands";
import {
  setTodoBlockCompletion,
  setTodoBlockRecurrence,
  stopTodoBlockRecurrence,
  toggleTodoBlock,
} from "../../../../core/todo/commands/todoCompletionRecurrenceCommands";
import {
  createTodoParseIndex,
} from "../../../../core/todo/indexes/todoParseIndex";
import type { TodoContent } from "../../../../core/todo/model/todoContent";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
} from "../todoTestFixture";

export function firstParsedTodoCollection(content: TodoContent) {
  return createTodoParseIndex(content).collections[0]!;
}

export function renameTodoCollectionForTest(
  content: TodoContent,
  input: Parameters<typeof renameTodoCollection>[2],
) {
  return renameTodoCollection(content, createTodoParseIndex(content), input);
}

export function toggleTodoBlockForTest(
  content: TodoContent,
  input: Parameters<typeof toggleTodoBlock>[2],
) {
  return toggleTodoBlock(content, createTodoParseIndex(content), input);
}

export function setTodoBlockCompletionForTest(
  content: TodoContent,
  input: Parameters<typeof setTodoBlockCompletion>[2],
) {
  return setTodoBlockCompletion(
    content,
    createTodoParseIndex(content),
    input,
  );
}

export function setTodoBlockRecurrenceForTest(
  content: TodoContent,
  input: Omit<Parameters<typeof setTodoBlockRecurrence>[2], "updatedAt"> & {
    updatedAt?: string;
  },
) {
  const block = createTodoParseIndex(content)
    .getParsedCollection(input.collectionId)!
    .analysis.document.blocks.find(({ id }) => id === input.blockId)!;

  return setTodoBlockRecurrence(
    content,
    createTodoParseIndex(content),
    {
      ...input,
      updatedAt: input.updatedAt ??
        new Date(Date.parse(block.metadata.updatedAt) + 1).toISOString(),
    },
  );
}

export function stopTodoBlockRecurrenceForTest(
  content: TodoContent,
  input: Omit<Parameters<typeof stopTodoBlockRecurrence>[2], "updatedAt"> & {
    updatedAt?: string;
  },
) {
  const block = createTodoParseIndex(content)
    .getParsedCollection(input.collectionId)!
    .analysis.document.blocks.find(({ id }) => id === input.blockId)!;

  return stopTodoBlockRecurrence(
    content,
    createTodoParseIndex(content),
    {
      ...input,
      updatedAt: input.updatedAt ??
        new Date(Date.parse(block.metadata.updatedAt) + 1).toISOString(),
    },
  );
}

export function moveTodoBlockForTest(
  content: TodoContent,
  input: Parameters<typeof moveTodoBlock>[2],
) {
  return moveTodoBlock(
    content,
    createTodoParseIndex(content),
    input,
  ).content;
}

export function createTodoCollectionWithTasks() {
  let content = appendTodoTestCollection(createEmptyTodoContent(), {
    collectionIndex: 1,
    createdAt: todoTimestamp(1),
    name: "工作",
  });
  content = appendTodoTestItem(content, {
    collectionIndex: 1,
    createdAt: todoTimestamp(2),
    itemIndex: 1,
    text: "父任务",
  });
  return appendTodoTestItem(content, {
    collectionIndex: 1,
    createdAt: todoTimestamp(3),
    itemIndex: 2,
    level: 1,
    text: "子任务",
  });
}

export const todoRecurrenceStageId = (index: number) =>
  `todo-recurrence-stage-00000000-0000-4000-8000-${String(index).padStart(
    12,
    "0",
  )}` as const;

export { todoBlockId, todoCollectionId, todoTimestamp };
