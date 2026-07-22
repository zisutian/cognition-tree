// SPDX-License-Identifier: GPL-3.0-or-later

import { getPortableNameIssue } from "../../portable-name/portableName.ts";

export const todoRepositoryPurpose = "system-todo" as const;
export const todoRepositorySchemaVersion = 1 as const;

export type TodoCollectionId = `todo-collection-${string}`;
export type TodoItemId = `todo-item-${string}`;

export type TodoItem = {
  id: TodoItemId;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type TodoCollection = {
  id: TodoCollectionId;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: TodoItem[];
};

export type TodoContent = {
  purpose: typeof todoRepositoryPurpose;
  schemaVersion: typeof todoRepositorySchemaVersion;
  collections: TodoCollection[];
};

/** Shape accepted after the runtime-neutral system wire parser has run. */
export type TodoItemValue = Omit<TodoItem, "id"> & { id: string };

/** Shape accepted after the runtime-neutral system wire parser has run. */
export type TodoCollectionValue = Omit<TodoCollection, "id" | "items"> & {
  id: string;
  items: TodoItemValue[];
};

/** Shape accepted after the runtime-neutral system wire parser has run. */
export type TodoContentValue = Omit<TodoContent, "collections"> & {
  collections: TodoCollectionValue[];
};

const collectionIdPattern =
  /^todo-collection-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const itemIdPattern =
  /^todo-item-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class TodoContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TodoContentValidationError";
  }
}

export function isTodoCollectionId(value: string): value is TodoCollectionId {
  return collectionIdPattern.test(value);
}

export function isTodoItemId(value: string): value is TodoItemId {
  return itemIdPattern.test(value);
}

function readCanonicalTimestamp(value: string, label: string) {
  const milliseconds = Date.parse(value);

  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new TodoContentValidationError(
      `${label} must be a canonical ISO timestamp.`,
    );
  }
  return milliseconds;
}

function validateTodoItem(item: TodoItemValue) {
  if (!isTodoItemId(item.id)) {
    throw new TodoContentValidationError(`Invalid todo item id: ${item.id}`);
  }
  if (item.text.trim().length === 0) {
    throw new TodoContentValidationError(
      `Todo item ${item.id} text must not be empty.`,
    );
  }

  const createdAt = readCanonicalTimestamp(
    item.createdAt,
    `Todo item ${item.id} createdAt`,
  );
  const updatedAt = readCanonicalTimestamp(
    item.updatedAt,
    `Todo item ${item.id} updatedAt`,
  );

  if (updatedAt < createdAt) {
    throw new TodoContentValidationError(
      `Todo item ${item.id} updatedAt is before createdAt.`,
    );
  }
  if ((item.completedAt !== null) !== item.completed) {
    throw new TodoContentValidationError(
      `Todo item ${item.id} completed and completedAt must describe the same state.`,
    );
  }
  if (item.completedAt !== null) {
    const completedAt = readCanonicalTimestamp(
      item.completedAt,
      `Todo item ${item.id} completedAt`,
    );

    if (completedAt < createdAt) {
      throw new TodoContentValidationError(
        `Todo item ${item.id} completedAt is before createdAt.`,
      );
    }
    if (completedAt > updatedAt) {
      throw new TodoContentValidationError(
        `Todo item ${item.id} completedAt is after updatedAt.`,
      );
    }
  }

  return updatedAt;
}

export function validateTodoContent(content: TodoContentValue): TodoContent {
  if (content.purpose !== todoRepositoryPurpose) {
    throw new TodoContentValidationError(
      `Todo purpose must be ${todoRepositoryPurpose}.`,
    );
  }
  if (content.schemaVersion !== todoRepositorySchemaVersion) {
    throw new TodoContentValidationError(
      `Todo schema version must be ${todoRepositorySchemaVersion}.`,
    );
  }

  const collectionIds = new Set<TodoCollectionId>();
  const itemIds = new Set<TodoItemId>();

  for (const collection of content.collections) {
    if (!isTodoCollectionId(collection.id)) {
      throw new TodoContentValidationError(
        `Invalid todo collection id: ${collection.id}`,
      );
    }
    if (collectionIds.has(collection.id)) {
      throw new TodoContentValidationError(
        `Duplicate todo collection id: ${collection.id}`,
      );
    }
    collectionIds.add(collection.id);

    const nameIssue = getPortableNameIssue(collection.name);

    if (nameIssue === "empty") {
      throw new TodoContentValidationError(
        `Todo collection ${collection.id} name must not be empty.`,
      );
    }
    if (nameIssue === "noncanonical") {
      throw new TodoContentValidationError(
        `Todo collection ${collection.id} name must be canonical.`,
      );
    }
    if (nameIssue === "unsupported-character") {
      throw new TodoContentValidationError(
        `Todo collection ${collection.id} name contains unsupported characters.`,
      );
    }
    const createdAt = readCanonicalTimestamp(
      collection.createdAt,
      `Todo collection ${collection.id} createdAt`,
    );
    const updatedAt = readCanonicalTimestamp(
      collection.updatedAt,
      `Todo collection ${collection.id} updatedAt`,
    );

    if (updatedAt < createdAt) {
      throw new TodoContentValidationError(
        `Todo collection ${collection.id} updatedAt is before createdAt.`,
      );
    }

    for (const item of collection.items) {
      const itemUpdatedAt = validateTodoItem(item);
      const itemCreatedAt = Date.parse(item.createdAt);

      if (itemIds.has(item.id as TodoItemId)) {
        throw new TodoContentValidationError(
          `Duplicate todo item id: ${item.id}`,
        );
      }
      itemIds.add(item.id as TodoItemId);
      if (itemCreatedAt < createdAt) {
        throw new TodoContentValidationError(
          `Todo item ${item.id} was created before collection ${collection.id}.`,
        );
      }
      if (itemUpdatedAt > updatedAt) {
        throw new TodoContentValidationError(
          `Todo collection ${collection.id} updatedAt is before item ${item.id} updatedAt.`,
        );
      }
    }
  }

  return content as TodoContent;
}

type LocatedTodoItem = {
  collectionId: TodoCollectionId;
  item: TodoItem;
};

function collectTodoItems(content: TodoContent) {
  const items = new Map<TodoItemId, LocatedTodoItem>();

  for (const collection of content.collections) {
    for (const item of collection.items) {
      items.set(item.id, { collectionId: collection.id, item });
    }
  }
  return items;
}

/**
 * Validates facts whose immutability or ordering can only be proven by
 * comparing two repository generations. Collections and items may be added,
 * removed, or reordered, but a surviving identity keeps its creation facts
 * and an item cannot change its owning collection.
 */
export function validateTodoContentTransition(
  previousValue: TodoContentValue,
  nextValue: TodoContentValue,
): TodoContent {
  const previous = validateTodoContent(previousValue);
  const next = validateTodoContent(nextValue);
  const previousCollections = new Map(
    previous.collections.map((collection) => [collection.id, collection]),
  );
  const nextCollections = new Map(
    next.collections.map((collection) => [collection.id, collection]),
  );
  const previousItems = collectTodoItems(previous);
  const nextItems = collectTodoItems(next);

  for (const previousCollection of previous.collections) {
    const nextCollection = nextCollections.get(previousCollection.id);

    if (!nextCollection) continue;
    if (previousCollection.createdAt !== nextCollection.createdAt) {
      throw new TodoContentValidationError(
        `Todo collection ${previousCollection.id} createdAt is immutable.`,
      );
    }
    if (
      Date.parse(nextCollection.updatedAt) <
        Date.parse(previousCollection.updatedAt)
    ) {
      throw new TodoContentValidationError(
        `Todo collection ${previousCollection.id} updatedAt cannot move backwards.`,
      );
    }
  }

  for (const [itemId, previousLocation] of previousItems) {
    const nextLocation = nextItems.get(itemId);

    if (!nextLocation) continue;
    if (previousLocation.collectionId !== nextLocation.collectionId) {
      throw new TodoContentValidationError(
        `Todo item ${itemId} cannot move to another collection.`,
      );
    }
    const previousItem = previousLocation.item;
    const nextItem = nextLocation.item;

    if (previousItem.createdAt !== nextItem.createdAt) {
      throw new TodoContentValidationError(
        `Todo item ${itemId} createdAt is immutable.`,
      );
    }
    if (Date.parse(nextItem.updatedAt) < Date.parse(previousItem.updatedAt)) {
      throw new TodoContentValidationError(
        `Todo item ${itemId} updatedAt cannot move backwards.`,
      );
    }
    // Snapshot pairs may coalesce a completion plus later edits, or skip an
    // intermediate reopen before recompletion. They therefore cannot prove
    // completedAt immutability. A changed completion timestamp must still be
    // no earlier than the last observed item update.
    if (
      nextItem.completed &&
      previousItem.completedAt !== nextItem.completedAt &&
      Date.parse(nextItem.completedAt!) < Date.parse(previousItem.updatedAt)
    ) {
      throw new TodoContentValidationError(
        `Todo item ${itemId} completedAt cannot predate the completion transition.`,
      );
    }
  }

  for (const [itemId, nextLocation] of nextItems) {
    if (previousItems.has(itemId)) continue;
    const previousCollection = previousCollections.get(
      nextLocation.collectionId,
    );

    if (
      previousCollection &&
      Date.parse(nextLocation.item.createdAt) <
        Date.parse(previousCollection.updatedAt)
    ) {
      throw new TodoContentValidationError(
        `Todo item ${itemId} was created before its collection's latest update.`,
      );
    }
  }

  return next;
}
