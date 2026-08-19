// SPDX-License-Identifier: GPL-3.0-or-later

import {
  executeTodoCommand,
  type TodoCommandExecutionRequest,
} from "../../../../application/todo/todoCommandExecutor.ts";
import type {
  ApiV1TodoCommandDto,
} from "../../../../contracts/api/types.ts";
import {
  VersionedContentRevisionConflictError,
} from "../../repository/versioned/contentStore.ts";
import {
  createTodoRevision,
  type TodoContentStore,
} from "../../repository/built-ins/todoStore.ts";
import {
  createPreparedCommandStoreAdapter,
} from "../../repository/preparedCommandStoreAdapter.ts";
import { todoResourceVersions } from "../resources/versions.ts";
import type { ApiV1Runtime } from "../http/runtime.ts";

function toTodoCommandRequest(
  command: ApiV1TodoCommandDto,
): TodoCommandExecutionRequest {
  switch (command.kind) {
    case "create-collection":
      return {
        command: {
          body: command.body,
          kind: command.kind,
          name: command.name,
        },
        mode: command.mode,
        preconditions: {
          expectedOrderVersion: command.expectedOrderVersion,
        },
      };
    case "delete-collection":
      return {
        command: { collectionId: command.collectionId, kind: command.kind },
        mode: command.mode,
        preconditions: {
          expectedStateVersion: command.expectedStateVersion,
          expectedVersion: command.expectedVersion,
        },
      };
    case "set-completion":
      return {
        command: {
          blockId: command.blockId,
          collectionId: command.collectionId,
          completed: command.completed,
          kind: command.kind,
          occurrenceDate: command.occurrenceDate,
        },
        mode: command.mode,
        preconditions: {
          expectedStateVersion: command.expectedStateVersion,
        },
      };
    case "set-recurrence":
      return {
        command: {
          blockId: command.blockId,
          collectionId: command.collectionId,
          kind: command.kind,
          rule: command.rule,
        },
        mode: command.mode,
        preconditions: {
          expectedStateVersion: command.expectedStateVersion,
        },
      };
    case "stop-recurrence":
      return {
        command: {
          blockId: command.blockId,
          collectionId: command.collectionId,
          kind: command.kind,
        },
        mode: command.mode,
        preconditions: {
          expectedStateVersion: command.expectedStateVersion,
        },
      };
    case "move-block":
      return {
        command: {
          collectionId: command.collectionId,
          kind: command.kind,
          sourceBlockId: command.sourceBlockId,
          targetBlockId: command.targetBlockId,
          targetKind: command.targetKind,
        },
        mode: command.mode,
        preconditions: { expectedVersion: command.expectedVersion },
      };
    case "move-collection":
      return {
        command: {
          collectionId: command.collectionId,
          kind: command.kind,
          toIndex: command.toIndex,
        },
        mode: command.mode,
        preconditions: {
          expectedOrderVersion: command.expectedOrderVersion,
        },
      };
    case "rename-collection":
      return {
        command: {
          collectionId: command.collectionId,
          kind: command.kind,
          name: command.name,
        },
        mode: command.mode,
        preconditions: { expectedVersion: command.expectedVersion },
      };
    case "replace-collection-body":
      return {
        command: {
          body: command.body,
          collectionId: command.collectionId,
          kind: command.kind,
        },
        mode: command.mode,
        preconditions: { expectedVersion: command.expectedVersion },
      };
  }
}

export function executeApiV1TodoCommand({
  command,
  runtime,
  store,
}: {
  command: ApiV1TodoCommandDto;
  runtime: ApiV1Runtime;
  store: TodoContentStore;
}) {
  return executeTodoCommand({
    createRevision: createTodoRevision,
    request: toTodoCommandRequest(command),
    runtime,
    store: createPreparedCommandStoreAdapter(
      store,
      (error) => error instanceof VersionedContentRevisionConflictError,
    ),
    versionPolicy: todoResourceVersions,
  });
}
