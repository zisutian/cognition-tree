// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createDomainTransition,
} from "../commands/domainCommand.ts";
import {
  executePreparedCommand,
  type CommandExecutionMode,
  type PreparedCommandStore,
} from "../commands/preparedCommandExecutor.ts";
import {
  readCommandRuntimeNow,
  type CommandRuntime,
} from "../commands/commandRuntime.ts";
import {
  createTodoBodyReplacement,
  prepareTodoMutation,
  type TodoDomainCommand,
  type TodoDomainVersions,
} from "./todoDomainCommands.ts";
import { projectTodoMutation } from "./todoDomainProjection.ts";
import {
  DomainNotFoundError,
  DomainValidationError,
} from "../../core/errors/domainErrors.ts";
import type {
  TodoBlockMoveTarget,
} from "../../core/todo/commands/todoBlockCommands.ts";
import type {
  TodoParseIndex,
} from "../../core/todo/indexes/todoParseIndex.ts";
import type {
  TodoCollectionId,
  TodoContent,
} from "../../core/todo/model/todoContent.ts";
import {
  createTodoCollectionBodyProjection,
} from "../../core/todo/model/todoCollectionProjection.ts";
import {
  isTodoCollectionId,
} from "../../core/todo/model/todoIdentity.ts";
import type {
  TodoLocalDate,
} from "../../core/todo/recurrence/todoLocalDate.ts";
import type {
  TodoRecurrenceRule,
} from "../../core/todo/recurrence/todoRecurrenceRule.ts";
import type {
  TodoRevision,
} from "./persistence/todoRepository.ts";

type ResourceVersion = `sha256:${string}`;

type TodoCommandInput =
  | {
      command: {
        body: string;
        kind: "create-collection";
        name: string;
      };
      preconditions: { expectedOrderVersion: ResourceVersion };
    }
  | {
      command: { collectionId: string; kind: "delete-collection" };
      preconditions: {
        expectedStateVersion: ResourceVersion;
        expectedVersion: ResourceVersion;
      };
    }
  | {
      command: {
        blockId: string;
        collectionId: string;
        completed: boolean;
        kind: "set-completion";
        occurrenceDate: TodoLocalDate | null;
      };
      preconditions: { expectedStateVersion: ResourceVersion };
    }
  | {
      command: {
        blockId: string;
        collectionId: string;
        kind: "set-recurrence";
        rule: TodoRecurrenceRule;
      };
      preconditions: { expectedStateVersion: ResourceVersion };
    }
  | {
      command: {
        blockId: string;
        collectionId: string;
        kind: "stop-recurrence";
      };
      preconditions: { expectedStateVersion: ResourceVersion };
    }
  | {
      command: {
        collectionId: string;
        kind: "move-block";
        sourceBlockId: string;
        targetBlockId: string | null;
        targetKind: "above" | "below" | "end" | "inside";
      };
      preconditions: { expectedVersion: ResourceVersion };
    }
  | {
      command: {
        collectionId: string;
        kind: "move-collection";
        toIndex: number;
      };
      preconditions: { expectedOrderVersion: ResourceVersion };
    }
  | {
      command: {
        collectionId: string;
        kind: "rename-collection";
        name: string;
      };
      preconditions: { expectedVersion: ResourceVersion };
    }
  | {
      command: {
        body: string;
        collectionId: string;
        kind: "replace-collection-body";
      };
      preconditions: { expectedVersion: ResourceVersion };
    };

export type TodoCommandExecutionRequest = TodoCommandInput & {
  mode: CommandExecutionMode;
};

type TodoCommandKind = TodoCommandInput["command"]["kind"];
type TodoCommandInputFor<Kind extends TodoCommandKind> = Extract<
  TodoCommandInput,
  { command: { kind: Kind } }
>;

export type TodoCommandRuntime = CommandRuntime & {
  today(date: Date): TodoLocalDate;
};

function inputFor<Kind extends TodoCommandKind>(
  input: TodoCommandInput,
  kind: Kind,
) {
  if (input.command.kind !== kind) {
    throw new Error(`Expected Todo command ${kind}.`);
  }
  return input as TodoCommandInputFor<Kind>;
}

function todoBlockTarget(
  input: TodoCommandInputFor<"move-block">,
): TodoBlockMoveTarget {
  const { command } = input;

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
  createId,
  index,
  input,
  timestamp,
  today,
}: {
  createId: () => string;
  index: TodoParseIndex;
  input: TodoCommandInput;
  timestamp: string;
  today: TodoLocalDate;
}): TodoDomainCommand {
  switch (input.command.kind) {
    case "create-collection": {
      const { command, preconditions } = inputFor(
        input,
        "create-collection",
      );
      return {
        body: command.body,
        collectionId: `todo-collection-${createId()}` as TodoCollectionId,
        createdAt: timestamp,
        expectedOrderVersion: preconditions.expectedOrderVersion,
        kind: command.kind,
        name: command.name,
      };
    }
    case "delete-collection": {
      const { command, preconditions } = inputFor(
        input,
        "delete-collection",
      );
      return {
        collectionId: command.collectionId,
        expectedStateVersion: preconditions.expectedStateVersion,
        expectedVersion: preconditions.expectedVersion,
        kind: command.kind,
        timestamp,
      };
    }
    case "move-block": {
      const narrowed = inputFor(input, "move-block");
      return {
        blockId: narrowed.command.sourceBlockId,
        collectionId: narrowed.command.collectionId,
        expectedVersion: narrowed.preconditions.expectedVersion,
        kind: narrowed.command.kind,
        target: todoBlockTarget(narrowed),
        updatedAt: timestamp,
      };
    }
    case "move-collection": {
      const { command, preconditions } = inputFor(input, "move-collection");
      return {
        ...command,
        expectedOrderVersion: preconditions.expectedOrderVersion,
        timestamp,
      };
    }
    case "rename-collection": {
      const { command, preconditions } = inputFor(
        input,
        "rename-collection",
      );
      return {
        ...command,
        expectedVersion: preconditions.expectedVersion,
        updatedAt: timestamp,
      };
    }
    case "replace-collection-body": {
      const { command, preconditions } = inputFor(
        input,
        "replace-collection-body",
      );
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
        expectedVersion: preconditions.expectedVersion,
        kind: command.kind,
        updatedAt: timestamp,
      };
    }
    case "set-completion": {
      const { command, preconditions } = inputFor(input, "set-completion");
      return {
        ...command,
        completedAt: timestamp,
        expectedStateVersion: preconditions.expectedStateVersion,
        today,
      };
    }
    case "set-recurrence": {
      const { command, preconditions } = inputFor(input, "set-recurrence");
      return {
        ...command,
        expectedStateVersion: preconditions.expectedStateVersion,
        stageId: `todo-recurrence-stage-${createId()}`,
        today,
        updatedAt: timestamp,
      };
    }
    case "stop-recurrence": {
      const { command, preconditions } = inputFor(input, "stop-recurrence");
      return {
        ...command,
        expectedStateVersion: preconditions.expectedStateVersion,
        today,
        updatedAt: timestamp,
      };
    }
  }
}

export function projectTodoContentChanges(
  before: TodoContent,
  after: TodoContent,
  timestamp: string,
  beforeIndex: TodoParseIndex,
  afterIndex: TodoParseIndex,
  versionPolicy: TodoDomainVersions,
) {
  return projectTodoMutation({
    after,
    afterIndex,
    before,
    beforeIndex,
    timestamp,
    versions: versionPolicy,
  });
}

export function executeTodoCommand({
  createRevision,
  request,
  runtime,
  store,
  versionPolicy,
}: {
  createRevision(content: TodoContent): TodoRevision;
  request: TodoCommandExecutionRequest;
  runtime: TodoCommandRuntime;
  store: PreparedCommandStore<TodoContent, TodoParseIndex, TodoRevision>;
  versionPolicy: TodoDomainVersions;
}) {
  const now = readCommandRuntimeNow(runtime);
  const today = runtime.today(now.date);
  const allocatedIds: string[] = [];

  return executePreparedCommand({
    mode: request.mode,
    prepare({ content, projection: index }) {
      let nextId = 0;
      const createId = () => {
        allocatedIds[nextId] ??= runtime.createId();
        return allocatedIds[nextId++]!;
      };
      const mutation = prepareTodoMutation({
        command: mapTodoCommand({
          createId,
          index,
          input: request,
          timestamp: now.timestamp,
          today,
        }),
        content,
        createBlockId: createId,
        index,
        versions: versionPolicy,
      });
      const projection = projectTodoMutation({
        after: mutation.content,
        afterIndex: mutation.index,
        before: content,
        beforeIndex: index,
        timestamp: mutation.timestamp,
        versions: versionPolicy,
      });
      const transition = createDomainTransition(mutation, projection);

      return {
        changes: transition.changes,
        content: transition.content,
        diff: transition.diff,
        projection: mutation.index,
        result: transition.result,
        revision: createRevision(transition.content),
      };
    },
    store,
  });
}
