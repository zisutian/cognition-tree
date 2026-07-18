// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  TodoCollectionId,
  TodoContent,
} from "../model/todoContent.ts";

export function resolveTodoCollectionSelection(
  content: TodoContent,
  requestedCollectionId: TodoCollectionId | null,
) {
  if (
    requestedCollectionId !== null &&
    content.collections.some(({ id }) => id === requestedCollectionId)
  ) {
    return requestedCollectionId;
  }
  return content.collections[0]?.id ?? null;
}

export function resolveTodoCollectionSelectionAfterDelete(
  content: TodoContent,
  deletedCollectionId: TodoCollectionId,
) {
  const deletedIndex = content.collections.findIndex(
    ({ id }) => id === deletedCollectionId,
  );

  if (deletedIndex < 0) {
    throw new Error(
      `Todo collection does not exist: ${deletedCollectionId}`,
    );
  }

  return content.collections[deletedIndex + 1]?.id ??
    content.collections[deletedIndex - 1]?.id ??
    null;
}
