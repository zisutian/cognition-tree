// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnEditableSourceChange } from "../../core/ctn/metadata/textEdits";
import { parseCtnCanonicalDocument } from "../../core/ctn/parser/parseCtnDocument";
import {
  createTodoCollection,
  deleteTodoCollection,
  moveTodoBlock,
  moveTodoCollection,
  renameTodoCollection,
  toggleTodoBlock,
  updateTodoCollectionBody,
  updateTodoSyntaxSource,
  type TodoBlockMoveTarget,
} from "../../core/todo/commands/todoCommands";
import {
  validateTodoContent,
  type TodoCollectionId,
  type TodoContent,
  type TodoContentValue,
} from "../../core/todo/model/todoContent";
import { requireTodoSyntaxProfile } from "../../core/todo/syntax/todoSyntax";
import {
  resolveTodoCollectionSelection,
  resolveTodoCollectionSelectionAfterDelete,
} from "../../core/todo/queries/todoQueries";
import type { TodoSessionState } from "./todoSessionController";

export type TodoApplicationServices = {
  createBlockId: () => string;
  createCollectionId: () => TodoCollectionId;
  now: () => Date;
};

export type TodoRepositorySession = {
  reload: () => Promise<void>;
  state: TodoSessionState;
  updateContent: (update: (current: TodoContent) => TodoContent) => void;
};

export type TodoDeleteCollectionMutationResult = {
  contentBefore: TodoContent;
  deletedCollectionId: TodoCollectionId;
  nextSelection: TodoCollectionId | null;
};

export type TodoMutationActions = {
  createCollection(name: string): TodoCollectionId;
  deleteCollection(collectionId: TodoCollectionId): TodoCollectionId | null;
  moveBlock(
    collectionId: TodoCollectionId,
    blockId: string,
    target: TodoBlockMoveTarget,
  ): void;
  moveCollection(collectionId: TodoCollectionId, toIndex: number): void;
  renameCollection(collectionId: TodoCollectionId, name: string): void;
  toggleBlock(collectionId: TodoCollectionId, blockId: string): void;
  updateCollectionBody(
    collectionId: TodoCollectionId,
    change: CtnEditableSourceChange,
  ): void;
  updateSyntaxSource(source: string): void;
};

function readBrowserRandomUuid() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("The browser cannot generate todo identifiers.");
  }
  return globalThis.crypto.randomUUID();
}

export function createBrowserTodoApplicationServices(): TodoApplicationServices {
  return {
    createBlockId: readBrowserRandomUuid,
    createCollectionId: () => `todo-collection-${readBrowserRandomUuid()}`,
    now: () => new Date(),
  };
}

export function requireTodoContent(
  content: TodoContentValue,
): TodoContent {
  return validateTodoContent(content);
}

function readNow(services: TodoApplicationServices) {
  const now = services.now();

  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Todo time source returned an invalid date.");
  }
  return now.toISOString();
}

function monotonicTimestamp(requested: string, content: TodoContent) {
  const syntaxProfile = requireTodoSyntaxProfile(content.syntaxSource);
  let latest = requested;

  for (const collection of content.collections) {
    const document = parseCtnCanonicalDocument(collection.source, syntaxProfile);

    for (const block of document.blocks) {
      if (Date.parse(block.metadata.updatedAt) > Date.parse(latest)) {
        latest = block.metadata.updatedAt;
      }
    }
    for (const completion of collection.completions) {
      if (Date.parse(completion.completedAt) > Date.parse(latest)) {
        latest = completion.completedAt;
      }
    }
  }
  return latest;
}

function updateTodoSession(
  session: Pick<TodoRepositorySession, "updateContent">,
  update: (content: TodoContent) => TodoContent,
) {
  session.updateContent((current) => update(requireTodoContent(current)));
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
  session: Pick<TodoRepositorySession, "updateContent">;
}): TodoMutationActions {
  const timestamp = (content: TodoContent) =>
    monotonicTimestamp(readNow(services), content);

  return {
    createCollection(name) {
      const collectionId = services.createCollectionId();
      let createdCollectionId: TodoCollectionId | null = null;

      updateTodoSession(session, (content) => {
        const result = createTodoCollection(content, {
          collectionId,
          createBlockId: services.createBlockId,
          createdAt: timestamp(content),
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
    deleteCollection(collectionId) {
      const outcome: { value?: TodoDeleteCollectionMutationResult } = {};

      updateTodoSession(session, (content) => {
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
    moveBlock(collectionId, blockId, target) {
      updateTodoSession(session, (content) =>
        moveTodoBlock(content, {
          blockId,
          collectionId,
          target,
          updatedAt: timestamp(content),
        })
      );
    },
    moveCollection(collectionId, toIndex) {
      updateTodoSession(session, (content) =>
        moveTodoCollection(content, { collectionId, toIndex })
      );
    },
    renameCollection(collectionId, name) {
      updateTodoSession(session, (content) =>
        renameTodoCollection(content, {
          collectionId,
          name,
          updatedAt: timestamp(content),
        })
      );
    },
    toggleBlock(collectionId, blockId) {
      updateTodoSession(session, (content) =>
        toggleTodoBlock(content, {
          blockId,
          collectionId,
          completedAt: timestamp(content),
        })
      );
    },
    updateCollectionBody(collectionId, change) {
      updateTodoSession(session, (content) =>
        updateTodoCollectionBody(content, {
          change,
          collectionId,
          createBlockId: services.createBlockId,
          updatedAt: timestamp(content),
        })
      );
    },
    updateSyntaxSource(source) {
      updateTodoSession(session, (content) =>
        updateTodoSyntaxSource(content, source)
      );
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
