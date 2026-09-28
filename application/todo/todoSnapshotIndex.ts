// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoCollection } from "../../core/todo/index.ts";

type TodoCompletion = TodoCollection["completions"][number];
type TodoRecurrence = TodoCollection["recurrences"][number];

type TodoSnapshotIndex = {
  firstCompletionById: ReadonlyMap<string, TodoCompletion>;
  lastCompletedAtById: ReadonlyMap<string, string>;
  firstRecurrenceById: ReadonlyMap<string, TodoRecurrence>;
  lastRecurrenceById: ReadonlyMap<string, TodoRecurrence>;
};

const indexes = new WeakMap<TodoCollection, TodoSnapshotIndex>();

/** One lookup view per immutable collection snapshot, shared by reading and versioning. */
export function getTodoSnapshotIndex(collection: TodoCollection): TodoSnapshotIndex {
  const cached = indexes.get(collection);
  if (cached) return cached;

  const firstCompletionById = new Map<string, TodoCompletion>();
  const lastCompletedAtById = new Map<string, string>();
  const firstRecurrenceById = new Map<string, TodoRecurrence>();
  const lastRecurrenceById = new Map<string, TodoRecurrence>();

  for (const completion of collection.completions) {
    if (!firstCompletionById.has(completion.blockId)) {
      firstCompletionById.set(completion.blockId, completion);
    }
    lastCompletedAtById.set(completion.blockId, completion.completedAt);
  }
  for (const recurrence of collection.recurrences) {
    if (!firstRecurrenceById.has(recurrence.blockId)) {
      firstRecurrenceById.set(recurrence.blockId, recurrence);
    }
    lastRecurrenceById.set(recurrence.blockId, recurrence);
  }

  const index = {
    firstCompletionById,
    lastCompletedAtById,
    firstRecurrenceById,
    lastRecurrenceById,
  };
  indexes.set(collection, index);
  return index;
}
