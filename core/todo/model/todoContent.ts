// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoRecurrence } from "../recurrence/todoRecurrence.ts";

export const todoRepositorySchemaVersion = 4 as const;
export const todoItemSemanticType = "todo-item";

export type TodoCollectionId = `todo-collection-${string}`;

export type TodoCompletion = {
  blockId: string;
  completedAt: string;
};

export type TodoCollection = {
  id: TodoCollectionId;
  source: string;
  completions: TodoCompletion[];
  recurrences: TodoRecurrence[];
};

export type TodoContent = {
  schemaVersion: typeof todoRepositorySchemaVersion;
  syntaxSource: string;
  collections: TodoCollection[];
};

export type TodoCollectionValue = Omit<TodoCollection, "id"> & { id: string };
export type TodoContentValue = Omit<TodoContent, "collections"> & {
  collections: TodoCollectionValue[];
};
