// SPDX-License-Identifier: GPL-3.0-or-later

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
import {
  validateTodoContent,
  type TodoCollectionId,
  type TodoContent,
  type TodoItemId,
} from "../../../todo/model/todoContent";
import {
  resolveTodoCollectionSelection,
  resolveTodoCollectionSelectionAfterDelete,
} from "../../../todo/queries/todoQueries";
import type { SystemRepositoryContent } from "../../storage/repository/systemRepository";
import type { SystemRepositorySession } from "../repository/useSystemRepositorySession";

export type TodoApplicationServices = {
  createCollectionId: () => TodoCollectionId;
  createItemId: () => TodoItemId;
  now: () => Date;
};

export type TodoSystemRepositorySession = Pick<
  SystemRepositorySession,
  "reload" | "state" | "updateContent"
>;

export type TodoDeleteCollectionMutationResult = {
  contentBefore: TodoContent;
  deletedCollectionId: TodoCollectionId;
  nextSelection: TodoCollectionId | null;
};

export type TodoMutationActions = {
  createCollection(name: string): TodoCollectionId;
  createItem(collectionId: TodoCollectionId, text: string): TodoItemId;
  deleteCollection(collectionId: TodoCollectionId): TodoCollectionId | null;
  deleteItem(collectionId: TodoCollectionId, itemId: TodoItemId): void;
  moveCollection(collectionId: TodoCollectionId, toIndex: number): void;
  moveItem(
    collectionId: TodoCollectionId,
    itemId: TodoItemId,
    toIndex: number,
  ): void;
  renameCollection(collectionId: TodoCollectionId, name: string): void;
  toggleItem(collectionId: TodoCollectionId, itemId: TodoItemId): void;
  updateItemText(
    collectionId: TodoCollectionId,
    itemId: TodoItemId,
    text: string,
  ): void;
};

function readBrowserRandomUuid() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("The browser cannot generate todo identifiers.");
  }
  return globalThis.crypto.randomUUID();
}

export function createBrowserTodoApplicationServices(): TodoApplicationServices {
  return {
    createCollectionId: () =>
      `todo-collection-${readBrowserRandomUuid()}`,
    createItemId: () => `todo-item-${readBrowserRandomUuid()}`,
    now: () => new Date(),
  };
}

export function requireTodoContent(
  content: SystemRepositoryContent,
): TodoContent {
  if (content.purpose !== "system-todo") {
    throw new Error("The todo application received non-todo content.");
  }
  return validateTodoContent(content);
}

function readNow(services: TodoApplicationServices) {
  const now = services.now();

  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Todo time source returned an invalid date.");
  }
  return now.toISOString();
}

function monotonicTimestamp(requested: string, current: string) {
  return Date.parse(requested) < Date.parse(current) ? current : requested;
}

function latestTodoTimestamp(content: TodoContent, fallback: string) {
  return content.collections.reduce(
    (latest, { updatedAt }) => monotonicTimestamp(updatedAt, latest),
    fallback,
  );
}

function requireCollection(content: TodoContent, collectionId: TodoCollectionId) {
  const collection = content.collections.find(({ id }) => id === collectionId);

  if (!collection) {
    throw new Error(`Todo collection does not exist: ${collectionId}`);
  }
  return collection;
}

export function createTodoMutationActions({
  onCollectionCreated,
  onCollectionDeleted,
  services,
  session,
}: {
  onCollectionCreated: (collectionId: TodoCollectionId) => void;
  onCollectionDeleted: (result: TodoDeleteCollectionMutationResult) => void;
  services: TodoApplicationServices;
  session: Pick<TodoSystemRepositorySession, "updateContent">;
}): TodoMutationActions {
  return {
    createCollection(name) {
      const requestedCreatedAt = readNow(services);
      const collectionId = services.createCollectionId();
      let createdCollectionId: TodoCollectionId | null = null;

      session.updateContent((current) => {
        const content = requireTodoContent(current);
        const result = createTodoCollection(content, {
          collectionId,
          createdAt: latestTodoTimestamp(content, requestedCreatedAt),
          name,
        });

        createdCollectionId = result.collectionId;
        return result.content;
      });
      if (!createdCollectionId) {
        throw new Error("The todo session did not apply the collection creation.");
      }
      onCollectionCreated(createdCollectionId);
      return createdCollectionId;
    },
    createItem(collectionId, text) {
      const requestedCreatedAt = readNow(services);
      const itemId = services.createItemId();
      let createdItemId: TodoItemId | null = null;

      session.updateContent((current) => {
        const content = requireTodoContent(current);
        const collection = requireCollection(content, collectionId);
        const result = createTodoItem(content, {
          collectionId,
          createdAt: monotonicTimestamp(
            requestedCreatedAt,
            collection.updatedAt,
          ),
          itemId,
          text,
        });

        createdItemId = result.itemId;
        return result.content;
      });
      if (!createdItemId) {
        throw new Error("The todo session did not apply the item creation.");
      }
      return createdItemId;
    },
    deleteCollection(collectionId) {
      const outcome: { value?: TodoDeleteCollectionMutationResult } = {};

      session.updateContent((current) => {
        const content = requireTodoContent(current);
        const nextSelection = resolveTodoCollectionSelectionAfterDelete(
          content,
          collectionId,
        );

        outcome.value = {
          contentBefore: content,
          deletedCollectionId: collectionId,
          nextSelection,
        };
        return deleteTodoCollection(content, collectionId);
      });
      const result = outcome.value;

      if (!result) {
        throw new Error("The todo session did not apply the collection deletion.");
      }
      onCollectionDeleted(result);
      return result.nextSelection;
    },
    deleteItem(collectionId, itemId) {
      const requestedUpdatedAt = readNow(services);

      session.updateContent((current) => {
        const content = requireTodoContent(current);
        const collection = requireCollection(content, collectionId);

        return deleteTodoItem(content, {
          collectionId,
          itemId,
          updatedAt: monotonicTimestamp(
            requestedUpdatedAt,
            collection.updatedAt,
          ),
        });
      });
    },
    moveCollection(collectionId, toIndex) {
      session.updateContent((current) =>
        moveTodoCollection(requireTodoContent(current), {
          collectionId,
          toIndex,
        })
      );
    },
    moveItem(collectionId, itemId, toIndex) {
      const requestedUpdatedAt = readNow(services);

      session.updateContent((current) => {
        const content = requireTodoContent(current);
        const collection = requireCollection(content, collectionId);

        return moveTodoItem(content, {
          collectionId,
          itemId,
          toIndex,
          updatedAt: monotonicTimestamp(
            requestedUpdatedAt,
            collection.updatedAt,
          ),
        });
      });
    },
    renameCollection(collectionId, name) {
      const requestedUpdatedAt = readNow(services);

      session.updateContent((current) => {
        const content = requireTodoContent(current);
        const collection = requireCollection(content, collectionId);

        return renameTodoCollection(content, {
          collectionId,
          name,
          updatedAt: monotonicTimestamp(
            requestedUpdatedAt,
            collection.updatedAt,
          ),
        });
      });
    },
    toggleItem(collectionId, itemId) {
      const requestedUpdatedAt = readNow(services);

      session.updateContent((current) => {
        const content = requireTodoContent(current);
        const collection = requireCollection(content, collectionId);

        return toggleTodoItem(content, {
          collectionId,
          itemId,
          updatedAt: monotonicTimestamp(
            requestedUpdatedAt,
            collection.updatedAt,
          ),
        });
      });
    },
    updateItemText(collectionId, itemId, text) {
      const requestedUpdatedAt = readNow(services);

      session.updateContent((current) => {
        const content = requireTodoContent(current);
        const collection = requireCollection(content, collectionId);

        return updateTodoItemText(content, {
          collectionId,
          itemId,
          text,
          updatedAt: monotonicTimestamp(
            requestedUpdatedAt,
            collection.updatedAt,
          ),
        });
      });
    },
  };
}

export function resolveRequestedTodoSelectionAfterDelete({
  contentBefore,
  deletedCollectionId,
  nextSelection,
  requestedCollectionId,
}: TodoDeleteCollectionMutationResult & {
  requestedCollectionId: TodoCollectionId | null;
}) {
  return resolveTodoCollectionSelection(contentBefore, requestedCollectionId) ===
      deletedCollectionId
    ? nextSelection
    : requestedCollectionId;
}
