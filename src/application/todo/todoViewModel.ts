// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  TodoCollectionId,
  TodoContent,
  TodoItemId,
} from "../../../todo/model/todoContent";
import type { SystemRepositoryPersistenceState } from "../repository/systemRepositorySessionController";
import type { TodoMutationActions } from "./todoApplication";

export type TodoCollectionListItem = {
  completedItemCount: number;
  createdAt: string;
  id: TodoCollectionId;
  isActive: boolean;
  itemCount: number;
  name: string;
  updatedAt: string;
};

export type TodoItemView = {
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  id: TodoItemId;
  text: string;
  updatedAt: string;
};

export type TodoActiveCollectionView = {
  createdAt: string;
  id: TodoCollectionId;
  name: string;
  updatedAt: string;
};

export type TodoViewModel = TodoMutationActions & {
  activeCollection: TodoActiveCollectionView | null;
  collections: TodoCollectionListItem[];
  items: TodoItemView[];
  persistence: SystemRepositoryPersistenceState;
  persistenceErrorMessage: string;
  selectCollection: (collectionId: TodoCollectionId) => void;
};

type TodoViewModelInput = TodoMutationActions & {
  activeCollectionId: TodoCollectionId | null;
  content: TodoContent;
  persistence: SystemRepositoryPersistenceState;
  selectCollection: (collectionId: TodoCollectionId) => void;
};

export function getTodoPersistenceErrorMessage(
  persistence: SystemRepositoryPersistenceState,
) {
  if (persistence.status === "error") {
    return persistence.message;
  }
  if (persistence.status === "conflict") {
    return "代办存在同步冲突，请前往仓库处理。";
  }
  return "";
}

export function createTodoViewModel({
  activeCollectionId,
  content,
  createCollection,
  createItem,
  deleteCollection,
  deleteItem,
  moveCollection,
  moveItem,
  persistence,
  renameCollection,
  selectCollection,
  toggleItem,
  updateItemText,
}: TodoViewModelInput): TodoViewModel {
  const activeCollection = activeCollectionId
    ? content.collections.find(({ id }) => id === activeCollectionId) ?? null
    : null;

  return {
    activeCollection: activeCollection
      ? {
          createdAt: activeCollection.createdAt,
          id: activeCollection.id,
          name: activeCollection.name,
          updatedAt: activeCollection.updatedAt,
        }
      : null,
    collections: content.collections.map((collection) => ({
      completedItemCount: collection.items.filter(({ completed }) => completed)
        .length,
      createdAt: collection.createdAt,
      id: collection.id,
      isActive: collection.id === activeCollectionId,
      itemCount: collection.items.length,
      name: collection.name,
      updatedAt: collection.updatedAt,
    })),
    createCollection,
    createItem,
    deleteCollection,
    deleteItem,
    items: activeCollection
      ? activeCollection.items.map((item) => ({ ...item }))
      : [],
    moveCollection,
    moveItem,
    persistence,
    persistenceErrorMessage: getTodoPersistenceErrorMessage(persistence),
    renameCollection,
    selectCollection,
    toggleItem,
    updateItemText,
  };
}
