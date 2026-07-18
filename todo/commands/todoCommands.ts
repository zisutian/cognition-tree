// SPDX-License-Identifier: GPL-3.0-or-later

import {
  isTodoCollectionId,
  isTodoItemId,
  validateTodoContent,
  type TodoCollection,
  type TodoCollectionId,
  type TodoContent,
  type TodoItemId,
} from "../model/todoContent.ts";

export type CreateTodoCollectionInput = {
  collectionId: TodoCollectionId;
  createdAt: string;
  name: string;
};

export type RenameTodoCollectionInput = {
  collectionId: TodoCollectionId;
  name: string;
  updatedAt: string;
};

export type MoveTodoCollectionInput = {
  collectionId: TodoCollectionId;
  toIndex: number;
};

export type CreateTodoItemInput = {
  collectionId: TodoCollectionId;
  createdAt: string;
  itemId: TodoItemId;
  text: string;
};

export type UpdateTodoItemTextInput = {
  collectionId: TodoCollectionId;
  itemId: TodoItemId;
  text: string;
  updatedAt: string;
};

export type ToggleTodoItemInput = {
  collectionId: TodoCollectionId;
  itemId: TodoItemId;
  updatedAt: string;
};

export type DeleteTodoItemInput = {
  collectionId: TodoCollectionId;
  itemId: TodoItemId;
  updatedAt: string;
};

export type MoveTodoItemInput = {
  collectionId: TodoCollectionId;
  itemId: TodoItemId;
  toIndex: number;
  updatedAt: string;
};

function canonicalTimestampMilliseconds(value: string, label: string) {
  const milliseconds = Date.parse(value);

  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new Error(`${label} must be a canonical ISO timestamp.`);
  }
  return milliseconds;
}

function normalizeCollectionName(name: string) {
  const normalized = name.trim();

  if (normalized.length === 0) {
    throw new Error("Todo collection name must not be empty.");
  }
  return normalized;
}

function assertItemText(text: string) {
  if (text.trim().length === 0) {
    throw new Error("Todo item text must not be empty.");
  }
}

function findCollectionIndex(
  content: TodoContent,
  collectionId: TodoCollectionId,
) {
  const index = content.collections.findIndex(({ id }) => id === collectionId);

  if (index < 0) {
    throw new Error(`Todo collection does not exist: ${collectionId}`);
  }
  return index;
}

function findItemIndex(collection: TodoCollection, itemId: TodoItemId) {
  const index = collection.items.findIndex(({ id }) => id === itemId);

  if (index < 0) {
    throw new Error(`Todo item does not exist: ${itemId}`);
  }
  return index;
}

function assertTimestampDoesNotMoveBackwards(
  currentTimestamp: string,
  nextTimestamp: string,
  label: string,
) {
  const current = canonicalTimestampMilliseconds(
    currentTimestamp,
    `${label} current timestamp`,
  );
  const next = canonicalTimestampMilliseconds(nextTimestamp, label);

  if (next < current) {
    throw new Error(`${label} cannot move backwards.`);
  }
}

function replaceCollection(
  content: TodoContent,
  collectionIndex: number,
  collection: TodoCollection,
) {
  const collections = [...content.collections];

  collections[collectionIndex] = collection;
  const next = { ...content, collections };

  validateTodoContent(next);
  return next;
}

function assertTargetIndex(toIndex: number, length: number, label: string) {
  if (!Number.isSafeInteger(toIndex) || toIndex < 0 || toIndex >= length) {
    throw new Error(`${label} target index is out of bounds: ${toIndex}`);
  }
}

function moveAt<T>(values: readonly T[], fromIndex: number, toIndex: number) {
  const next = [...values];
  const [value] = next.splice(fromIndex, 1);

  next.splice(toIndex, 0, value as T);
  return next;
}

export function createTodoCollection(
  content: TodoContent,
  input: CreateTodoCollectionInput,
) {
  validateTodoContent(content);
  if (!isTodoCollectionId(input.collectionId)) {
    throw new Error(`Invalid todo collection id: ${input.collectionId}`);
  }
  if (content.collections.some(({ id }) => id === input.collectionId)) {
    throw new Error(
      `Todo collection already exists: ${input.collectionId}`,
    );
  }
  canonicalTimestampMilliseconds(
    input.createdAt,
    "Todo collection createdAt",
  );

  const next: TodoContent = {
    ...content,
    collections: [
      ...content.collections,
      {
        createdAt: input.createdAt,
        id: input.collectionId,
        items: [],
        name: normalizeCollectionName(input.name),
        updatedAt: input.createdAt,
      },
    ],
  };

  validateTodoContent(next);
  return { collectionId: input.collectionId, content: next };
}

export function renameTodoCollection(
  content: TodoContent,
  input: RenameTodoCollectionInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const name = normalizeCollectionName(input.name);

  if (collection.name === name) return content;
  assertTimestampDoesNotMoveBackwards(
    collection.updatedAt,
    input.updatedAt,
    "Todo collection updatedAt",
  );

  return replaceCollection(content, collectionIndex, {
    ...collection,
    name,
    updatedAt: input.updatedAt,
  });
}

export function deleteTodoCollection(
  content: TodoContent,
  collectionId: TodoCollectionId,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, collectionId);
  const collections = [...content.collections];

  collections.splice(collectionIndex, 1);
  const next = { ...content, collections };

  validateTodoContent(next);
  return next;
}

export function moveTodoCollection(
  content: TodoContent,
  input: MoveTodoCollectionInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);

  assertTargetIndex(
    input.toIndex,
    content.collections.length,
    "Todo collection",
  );
  if (collectionIndex === input.toIndex) return content;

  const next = {
    ...content,
    collections: moveAt(
      content.collections,
      collectionIndex,
      input.toIndex,
    ),
  };

  validateTodoContent(next);
  return next;
}

export function createTodoItem(
  content: TodoContent,
  input: CreateTodoItemInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];

  if (!isTodoItemId(input.itemId)) {
    throw new Error(`Invalid todo item id: ${input.itemId}`);
  }
  if (
    content.collections.some(({ items }) =>
      items.some(({ id }) => id === input.itemId)
    )
  ) {
    throw new Error(`Todo item already exists: ${input.itemId}`);
  }
  assertItemText(input.text);
  assertTimestampDoesNotMoveBackwards(
    collection.updatedAt,
    input.createdAt,
    "Todo item createdAt",
  );

  const next = replaceCollection(content, collectionIndex, {
    ...collection,
    items: [
      ...collection.items,
      {
        completed: false,
        completedAt: null,
        createdAt: input.createdAt,
        id: input.itemId,
        text: input.text,
        updatedAt: input.createdAt,
      },
    ],
    updatedAt: input.createdAt,
  });

  return { content: next, itemId: input.itemId };
}

export function updateTodoItemText(
  content: TodoContent,
  input: UpdateTodoItemTextInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const itemIndex = findItemIndex(collection, input.itemId);
  const item = collection.items[itemIndex];

  assertItemText(input.text);
  if (item.text === input.text) return content;
  assertTimestampDoesNotMoveBackwards(
    collection.updatedAt,
    input.updatedAt,
    "Todo item updatedAt",
  );

  const items = [...collection.items];

  items[itemIndex] = { ...item, text: input.text, updatedAt: input.updatedAt };
  return replaceCollection(content, collectionIndex, {
    ...collection,
    items,
    updatedAt: input.updatedAt,
  });
}

export function toggleTodoItem(
  content: TodoContent,
  input: ToggleTodoItemInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const itemIndex = findItemIndex(collection, input.itemId);
  const item = collection.items[itemIndex];

  assertTimestampDoesNotMoveBackwards(
    collection.updatedAt,
    input.updatedAt,
    "Todo item updatedAt",
  );
  const completed = !item.completed;
  const items = [...collection.items];

  items[itemIndex] = {
    ...item,
    completed,
    completedAt: completed ? input.updatedAt : null,
    updatedAt: input.updatedAt,
  };
  return replaceCollection(content, collectionIndex, {
    ...collection,
    items,
    updatedAt: input.updatedAt,
  });
}

export function deleteTodoItem(
  content: TodoContent,
  input: DeleteTodoItemInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const itemIndex = findItemIndex(collection, input.itemId);

  assertTimestampDoesNotMoveBackwards(
    collection.updatedAt,
    input.updatedAt,
    "Todo collection updatedAt",
  );
  const items = [...collection.items];

  items.splice(itemIndex, 1);
  return replaceCollection(content, collectionIndex, {
    ...collection,
    items,
    updatedAt: input.updatedAt,
  });
}

export function moveTodoItem(
  content: TodoContent,
  input: MoveTodoItemInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const itemIndex = findItemIndex(collection, input.itemId);

  assertTargetIndex(input.toIndex, collection.items.length, "Todo item");
  if (itemIndex === input.toIndex) return content;
  assertTimestampDoesNotMoveBackwards(
    collection.updatedAt,
    input.updatedAt,
    "Todo collection updatedAt",
  );

  return replaceCollection(content, collectionIndex, {
    ...collection,
    items: moveAt(collection.items, itemIndex, input.toIndex),
    updatedAt: input.updatedAt,
  });
}
