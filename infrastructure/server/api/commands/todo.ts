// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiV1TodoCommandDto,
} from "../../../../contracts/api/types.ts";
import {
  createTodoBodyReplacement,
  prepareTodoMutation,
  type TodoDomainCommand,
  type TodoDomainVersions,
} from "../../../../application/todo/todoDomainCommands.ts";
import { projectTodoMutation } from "../../../../application/todo/todoDomainProjection.ts";
import {
  createDomainTransition,
} from "../../../../application/commands/domainCommand.ts";
import {
  DomainNotFoundError,
  DomainValidationError,
} from "../../../../core/errors/domainErrors.ts";
import type {
  TodoBlockMoveTarget,
} from "../../../../core/todo/commands/todoCommands.ts";
import type { TodoParseIndex } from "../../../../core/todo/indexes/todoParseIndex.ts";
import {
  createTodoCollectionBodyProjection,
  isTodoCollectionId,
  type TodoCollectionId,
  type TodoContent,
} from "../../../../core/todo/model/todoContent.ts";
import type {
  VersionedContentStore,
} from "../../repository/versioned/contentStore.ts";
import {
  createTodoRevision,
} from "../../repository/built-ins/todoStore.ts";
import {
  executeApiV1VersionedCommand,
} from "./common.ts";
import {
  createParsedTodoCollectionVersion,
  createTodoCollectionStateVersion,
  createTodoItemStateVersion,
  createTodoOrderVersion,
} from "../resources/versions.ts";
import {
  readApiV1RuntimeNow,
  type ApiV1Runtime,
} from "../http/runtime.ts";

const todoVersions: TodoDomainVersions = {
  collection: createParsedTodoCollectionVersion,
  collectionState: createTodoCollectionStateVersion,
  itemState: createTodoItemStateVersion,
  order: createTodoOrderVersion,
};

function todoBlockTarget(
  command: Extract<ApiV1TodoCommandDto, { kind: "move-block" }>,
): TodoBlockMoveTarget {
  if (command.targetKind === "end") {
    if (command.targetBlockId !== null) {
      throw new DomainValidationError(
        "End block target must not include targetBlockId",
      );
    }
    return { kind: "end" };
  }
  if (command.targetBlockId === null) {
    throw new DomainNotFoundError(
      "target-block",
      "Target Todo block does not exist",
    );
  }
  return {
    kind: command.targetKind,
    targetBlockId: command.targetBlockId,
  };
}

function mapTodoCommand({
  command,
  createId,
  index,
  timestamp,
  today,
}: {
  command: ApiV1TodoCommandDto;
  createId: () => string;
  index: TodoParseIndex;
  timestamp: string;
  today: ReturnType<typeof readApiV1RuntimeNow>["today"];
}): TodoDomainCommand {
  switch (command.kind) {
    case "create-collection":
      return {
        body: command.body,
        collectionId: `todo-collection-${createId()}` as TodoCollectionId,
        createdAt: timestamp,
        expectedOrderVersion: command.expectedOrderVersion,
        kind: "create-collection",
        name: command.name,
      };
    case "delete-collection":
      return { ...command, timestamp };
    case "move-block":
      return {
        blockId: command.sourceBlockId,
        collectionId: command.collectionId,
        expectedVersion: command.expectedVersion,
        kind: command.kind,
        target: todoBlockTarget(command),
        updatedAt: timestamp,
      };
    case "move-collection":
      return { ...command, timestamp };
    case "rename-collection":
      return { ...command, updatedAt: timestamp };
    case "replace-collection-body": {
      if (!isTodoCollectionId(command.collectionId)) {
        throw new DomainNotFoundError(
          command.collectionId,
          "Todo collection does not exist",
        );
      }
      const parsed = index.getParsedCollection(command.collectionId);

      if (!parsed) {
        throw new DomainNotFoundError(
          command.collectionId,
          "Todo collection does not exist",
        );
      }
      return {
        change: createTodoBodyReplacement(
          createTodoCollectionBodyProjection(parsed).source,
          command.body,
        ),
        collectionId: command.collectionId,
        expectedVersion: command.expectedVersion,
        kind: command.kind,
        updatedAt: timestamp,
      };
    }
    case "set-completion":
      return {
        ...command,
        completedAt: timestamp,
        today,
      };
    case "set-recurrence":
      return {
        ...command,
        stageId: `todo-recurrence-stage-${createId()}`,
        today,
        updatedAt: timestamp,
      };
    case "stop-recurrence":
      return { ...command, today, updatedAt: timestamp };
  }
}

export function projectApiV1TodoChanges(
  before: TodoContent,
  after: TodoContent,
  timestamp: string,
  beforeIndex?: TodoParseIndex,
  afterIndex?: TodoParseIndex,
) {
  return projectTodoMutation({
    after,
    afterIndex,
    before,
    beforeIndex,
    timestamp,
    versions: todoVersions,
  });
}

export async function executeApiV1TodoCommand({
  command,
  runtime,
  store,
}: {
  command: ApiV1TodoCommandDto;
  runtime: ApiV1Runtime;
  store: VersionedContentStore<TodoContent, TodoParseIndex>;
}) {
  const now = readApiV1RuntimeNow(runtime);
  const allocatedIds: string[] = [];

  return executeApiV1VersionedCommand({
    apply({ content, projection: index }) {
      let nextId = 0;
      const createId = () => {
        allocatedIds[nextId] ??= runtime.createId();
        return allocatedIds[nextId++]!;
      };
      const domainCommand = mapTodoCommand({
        command,
        createId,
        index,
        timestamp: now.timestamp,
        today: now.today,
      });
      const mutation = prepareTodoMutation({
        command: domainCommand,
        content,
        createBlockId: createId,
        index,
        versions: todoVersions,
      });
      const projection = projectTodoMutation({
        after: mutation.content,
        afterIndex: mutation.index,
        before: content,
        beforeIndex: index,
        timestamp: mutation.timestamp,
        versions: todoVersions,
      });
      const transition = createDomainTransition(mutation, projection);

      return {
        changes: transition.changes,
        content: transition.content,
        diff: transition.diff,
        projection: mutation.index,
        result: transition.result,
        revision: createTodoRevision(transition.content),
      };
    },
    mode: command.mode,
    store,
  });
}
