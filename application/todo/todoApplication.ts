// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnEditableSourceChange } from "../../core/ctn/metadata/textEdits";
import type {
  CtnCanonicalSourceAnalysis,
} from "../../core/ctn/analysis/sourceAnalysis";
import {
  updateTodoSyntaxSource,
  type TodoBlockMoveTarget,
} from "../../core/todo/commands/todoCommands";
import {
  type TodoCollectionId,
  type TodoContent,
  type TodoContentValue,
} from "../../core/todo/model/todoContent";
import { validateTodoContent } from "../../core/todo/model/todoValidation";
import type {
  TodoLocalDate,
} from "../../core/todo/recurrence/todoLocalDate";
import type {
  TodoRecurrenceRule,
} from "../../core/todo/recurrence/todoRecurrenceRule";
import type {
  TodoRecurrenceStageId,
} from "../../core/todo/recurrence/todoRecurrenceSchedule";
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
} from "../persistence/versionedRepository";
import {
  prepareTodoMutation,
} from "./todoDomainCommands";

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
  index?: TodoParseIndex;
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
      projection: result.index ??
        createTodoParseIndex(
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
        const result = prepareTodoMutation({
          command: {
            body: "",
            collectionId,
            createdAt: timestamp(index),
            kind: "create-collection",
            name,
          },
          content,
          createBlockId: services.createBlockId,
          index,
        });

        createdCollectionId = collectionId;
        return result;
      });
      if (!createdCollectionId) {
        throw new Error("The todo session did not apply the collection creation.");
      }
      onCollectionCreated(createdCollectionId);
      return createdCollectionId;
    },
    deleteCollection(collectionId) {
      const outcome: { value?: TodoDeleteCollectionMutationResult } = {};

      updateTodoSession(session, (content, index) => {
        const nextSelection = resolveTodoCollectionSelectionAfterDelete(
          content,
          collectionId,
        );

        outcome.value = {
          contentBefore: content,
          deletedCollectionId: collectionId,
          nextSelection,
        };
        return prepareTodoMutation({
          command: {
            collectionId,
            kind: "delete-collection",
            timestamp: index.latestTimestamp ?? "1970-01-01T00:00:00.000Z",
          },
          content,
          createBlockId: services.createBlockId,
          index,
        });
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
        return prepareTodoMutation({
          command: {
            blockId,
            collectionId,
            kind: "move-block",
            target,
            updatedAt: timestamp(index),
          },
          content,
          createBlockId: services.createBlockId,
          index,
        });
      });
    },
    moveCollection(collectionId, toIndex) {
      updateTodoSession(session, (content, index) =>
        prepareTodoMutation({
          command: {
            collectionId,
            kind: "move-collection",
            timestamp: index.latestTimestamp ?? "1970-01-01T00:00:00.000Z",
            toIndex,
          },
          content,
          createBlockId: services.createBlockId,
          index,
        })
      );
    },
    renameCollection(collectionId, name) {
      updateTodoSession(session, (content, index) =>
        prepareTodoMutation({
          command: {
            collectionId,
            kind: "rename-collection",
            name,
            updatedAt: timestamp(index),
          },
          content,
          createBlockId: services.createBlockId,
          index,
        })
      );
    },
    setBlockCompletion(
      collectionId,
      blockId,
      completed,
      occurrenceDate,
    ) {
      updateTodoSession(session, (content, index) =>
        prepareTodoMutation({
          command: {
            blockId,
            collectionId,
            completed,
            completedAt: timestamp(index),
            kind: "set-completion",
            occurrenceDate,
            today: services.localCalendar.today(),
          },
          content,
          createBlockId: services.createBlockId,
          index,
        })
      );
    },
    setBlockRecurrence(collectionId, blockId, rule) {
      updateTodoSession(session, (content, index) =>
        prepareTodoMutation({
          command: {
            blockId,
            collectionId,
            kind: "set-recurrence",
            rule,
            stageId: services.createRecurrenceStageId(),
            today: services.localCalendar.today(),
            updatedAt: timestamp(index),
          },
          content,
          createBlockId: services.createBlockId,
          index,
        })
      );
    },
    stopBlockRecurrence(collectionId, blockId) {
      updateTodoSession(session, (content, index) =>
        prepareTodoMutation({
          command: {
            blockId,
            collectionId,
            kind: "stop-recurrence",
            today: services.localCalendar.today(),
            updatedAt: timestamp(index),
          },
          content,
          createBlockId: services.createBlockId,
          index,
        })
      );
    },
    toggleBlock(collectionId, blockId) {
      updateTodoSession(session, (content, index) =>
        prepareTodoMutation({
          command: {
            blockId,
            collectionId,
            completedAt: timestamp(index),
            kind: "toggle-completion",
            today: services.localCalendar.today(),
          },
          content,
          createBlockId: services.createBlockId,
          index,
        })
      );
    },
    updateCollectionBody(collectionId, change) {
      updateTodoSession(session, (content, index) => {
        return prepareTodoMutation({
          command: {
            change,
            collectionId,
            kind: "replace-collection-body",
            updatedAt: timestamp(index),
          },
          content,
          createBlockId: services.createBlockId,
          index,
        });
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
