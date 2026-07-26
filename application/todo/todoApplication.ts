// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnEditableSourceChange } from "../../core/ctn/metadata/textEdits";
import type {
  CtnCanonicalSourceAnalysis,
} from "../../core/ctn/analysis/sourceAnalysis";
import {
  createTodoCollection,
  deleteTodoCollection,
  moveTodoBlock,
  moveTodoCollection,
  renameTodoCollection,
  setTodoBlockCompletion,
  setTodoBlockRecurrence,
  stopTodoBlockRecurrence,
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
import type {
  TodoLocalDate,
  TodoRecurrenceRule,
  TodoRecurrenceStageId,
} from "../../core/todo/recurrence/todoRecurrence";
import {
  resolveTodoCollectionSelection,
  resolveTodoCollectionSelectionAfterDelete,
} from "../../core/todo/queries/todoQueries";
import type { TodoSessionState } from "./todoSessionController";
import type { ApplicationLocalCalendar } from "../runtime/applicationLocalCalendar";
import {
  createTodoParseIndex,
  type TodoParseIndex,
} from "../../core/todo/indexes/todoParseIndex";
import type {
  PreparedVersionedContent,
} from "../persistence/versionedSessionController";

export type TodoApplicationServices = {
  createBlockId: () => string;
  createCollectionId: () => TodoCollectionId;
  createRecurrenceStageId: () => TodoRecurrenceStageId;
  localCalendar: ApplicationLocalCalendar;
  now: () => Date;
};

export type TodoRepositorySession = {
  mutate: (update: (current: TodoContent) => TodoContent) => void;
  mutatePrepared: (
    update: (
      current: PreparedVersionedContent<TodoContent, TodoParseIndex>,
    ) => PreparedVersionedContent<TodoContent, TodoParseIndex>,
  ) => void;
  reload: () => Promise<void>;
  state: TodoSessionState;
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
  setBlockCompletion(
    collectionId: TodoCollectionId,
    blockId: string,
    completed: boolean,
    occurrenceDate: TodoLocalDate | null,
  ): void;
  setBlockRecurrence(
    collectionId: TodoCollectionId,
    blockId: string,
    rule: TodoRecurrenceRule,
  ): void;
  stopBlockRecurrence(collectionId: TodoCollectionId, blockId: string): void;
  toggleBlock(collectionId: TodoCollectionId, blockId: string): void;
  updateCollectionBody(
    collectionId: TodoCollectionId,
    change: CtnEditableSourceChange,
  ): void;
  updateSyntaxSource(source: string): void;
};

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

function monotonicTimestamp(requested: string, latest: string | null) {
  return latest !== null && Date.parse(latest) > Date.parse(requested)
    ? latest
    : requested;
}

type TodoPreparedMutation = {
  analysisOverrides?: ReadonlyMap<
    TodoCollectionId,
    CtnCanonicalSourceAnalysis
  >;
  content: TodoContent;
};

function updateTodoSession(
  session: Pick<TodoRepositorySession, "mutatePrepared">,
  update: (
    content: TodoContent,
    index: TodoParseIndex,
  ) => TodoPreparedMutation,
) {
  session.mutatePrepared(({ content, projection }) => {
    const result = update(content, projection);

    return {
      content: result.content,
      projection: createTodoParseIndex(
        result.content,
        projection,
        result.analysisOverrides,
      ),
    };
  });
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
  session: Pick<TodoRepositorySession, "mutatePrepared">;
}): TodoMutationActions {
  const timestamp = (index: TodoParseIndex) =>
    monotonicTimestamp(readNow(services), index.latestTimestamp);

  return {
    createCollection(name) {
      const collectionId = services.createCollectionId();
      let createdCollectionId: TodoCollectionId | null = null;

      updateTodoSession(session, (content, index) => {
        const result = createTodoCollection(content, index, {
          collectionId,
          createBlockId: services.createBlockId,
          createdAt: timestamp(index),
          name,
        });

        createdCollectionId = result.collectionId;
        return {
          analysisOverrides: new Map([
            [collectionId, result.analysis],
          ]),
          content: result.content,
        };
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
        return { content: deleteTodoCollection(content, collectionId) };
      });
      const result = outcome.value;

      if (!result) {
        throw new Error("The todo session did not apply the collection deletion.");
      }
      onCollectionDeleted(result);
      return result.nextSelection;
    },
    moveBlock(collectionId, blockId, target) {
      updateTodoSession(session, (content, index) => {
        const result = moveTodoBlock(content, index, {
          blockId,
          collectionId,
          target,
          updatedAt: timestamp(index),
        });

        return {
          analysisOverrides: new Map([[collectionId, result.analysis]]),
          content: result.content,
        };
      });
    },
    moveCollection(collectionId, toIndex) {
      updateTodoSession(session, (content) => ({
        content: moveTodoCollection(content, { collectionId, toIndex }),
      }));
    },
    renameCollection(collectionId, name) {
      updateTodoSession(session, (content, index) => ({
        content: renameTodoCollection(content, index, {
          collectionId,
          name,
          updatedAt: timestamp(index),
        }),
      }));
    },
    setBlockCompletion(
      collectionId,
      blockId,
      completed,
      occurrenceDate,
    ) {
      updateTodoSession(session, (content, index) => ({
        content: setTodoBlockCompletion(content, index, {
          blockId,
          collectionId,
          completed,
          completedAt: timestamp(index),
          occurrenceDate,
          today: services.localCalendar.today(),
        }),
      }));
    },
    setBlockRecurrence(collectionId, blockId, rule) {
      updateTodoSession(session, (content, index) => ({
        content: setTodoBlockRecurrence(content, index, {
          blockId,
          collectionId,
          rule,
          stageId: services.createRecurrenceStageId(),
          today: services.localCalendar.today(),
        }),
      }));
    },
    stopBlockRecurrence(collectionId, blockId) {
      updateTodoSession(session, (content) => ({
        content: stopTodoBlockRecurrence(content, {
          blockId,
          collectionId,
          today: services.localCalendar.today(),
        }),
      }));
    },
    toggleBlock(collectionId, blockId) {
      updateTodoSession(session, (content, index) => ({
        content: toggleTodoBlock(content, index, {
          blockId,
          collectionId,
          completedAt: timestamp(index),
          today: services.localCalendar.today(),
        }),
      }));
    },
    updateCollectionBody(collectionId, change) {
      updateTodoSession(session, (content, index) => {
        const result = updateTodoCollectionBody(content, index, {
          change,
          collectionId,
          createBlockId: services.createBlockId,
          updatedAt: timestamp(index),
        });

        return {
          analysisOverrides: new Map([
            [collectionId, result.analysis],
          ]),
          content: result.content,
        };
      });
    },
    updateSyntaxSource(source) {
      updateTodoSession(session, (content, index) => {
        const result = updateTodoSyntaxSource(content, index, {
          createBlockId: services.createBlockId,
          source,
          updatedAt: timestamp(index),
        });

        return {
          analysisOverrides: result.analysisOverrides,
          content: result.content,
        };
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
