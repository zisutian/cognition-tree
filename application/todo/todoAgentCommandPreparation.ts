// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentPreparedCommand } from "../commands/agentCommandPreparation.ts";
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
import { DomainNotFoundError, DomainValidationError } from "../../core/errors/domainErrors.ts";
import type { TodoCommandOutcome } from "../../core/todo/commands/todoCommandOutcome.ts";
import type { TodoBlockMoveTarget } from "../../core/todo/commands/todoBlockCommands.ts";
import type { TodoParseIndex } from "../../core/todo/indexes/todoParseIndex.ts";
import type {
  TodoCollectionId,
  TodoContent,
} from "../../core/todo/model/todoContent.ts";
import { createTodoCollectionBodyProjection } from "../../core/todo/model/todoCollectionProjection.ts";
import { isTodoCollectionId } from "../../core/todo/model/todoIdentity.ts";
import type { TodoLocalDate } from "../../core/todo/recurrence/todoLocalDate.ts";
import type { TodoRecurrenceRule } from "../../core/todo/recurrence/todoRecurrenceRule.ts";
import type { PreparedVersionedSnapshot } from "../persistence/versionedRepository.ts";
import type { TodoRevision } from "./persistence/todoRepository.ts";

export type TodoAgentCommandIntent =
  | { body: string; kind: "create-collection"; name: string }
  | { collectionId: string; kind: "delete-collection" }
  | {
      blockId: string;
      collectionId: string;
      completed: boolean;
      kind: "set-completion";
      occurrenceDate: TodoLocalDate | null;
    }
  | {
      blockId: string;
      collectionId: string;
      kind: "set-recurrence";
      rule: TodoRecurrenceRule;
    }
  | { blockId: string; collectionId: string; kind: "stop-recurrence" }
  | {
      collectionId: string;
      kind: "move-block";
      sourceBlockId: string;
      targetBlockId: string | null;
      targetKind: "above" | "below" | "end" | "inside";
    }
  | { collectionId: string; kind: "move-collection"; toIndex: number }
  | { collectionId: string; kind: "rename-collection"; name: string }
  | { body: string; collectionId: string; kind: "replace-collection-body" };

export type TodoAgentCommandRuntime = CommandRuntime & {
  today(date: Date): TodoLocalDate;
};

function requireCollection(
  content: TodoContent,
  index: TodoParseIndex,
  collectionId: string,
) {
  if (!isTodoCollectionId(collectionId)) {
    throw new DomainNotFoundError(
      collectionId,
      "Todo collection does not exist",
    );
  }
  const parsed = index.getParsedCollection(collectionId);
  const collection = content.collections.find(({ id }) => id === collectionId);

  if (!parsed || !collection) {
    throw new DomainNotFoundError(
      collectionId,
      "Todo collection does not exist",
    );
  }
  return { collection, parsed };
}

function moveTarget(
  intent: Extract<TodoAgentCommandIntent, { kind: "move-block" }>,
): TodoBlockMoveTarget {
  if (intent.targetKind === "end") {
    if (intent.targetBlockId !== null) {
      throw new DomainValidationError(
        "End block target must not include targetBlockId",
      );
    }
    return { kind: "end" };
  }
  if (intent.targetBlockId === null) {
    throw new DomainNotFoundError(
      "target-block",
      "Target Todo block does not exist",
    );
  }
  return { kind: intent.targetKind, targetBlockId: intent.targetBlockId };
}

function toDomainCommand({
  content,
  createId,
  index,
  intent,
  timestamp,
  today,
  versions,
}: {
  content: TodoContent;
  createId(): string;
  index: TodoParseIndex;
  intent: TodoAgentCommandIntent;
  timestamp: string;
  today: TodoLocalDate;
  versions: TodoDomainVersions;
}): TodoDomainCommand {
  if (intent.kind === "create-collection") {
    return {
      ...intent,
      collectionId: `todo-collection-${createId()}` as TodoCollectionId,
      createdAt: timestamp,
      expectedOrderVersion: versions.order(content),
    };
  }
  const { collection, parsed } = requireCollection(
    content,
    index,
    intent.collectionId,
  );

  switch (intent.kind) {
    case "delete-collection":
      return {
        ...intent,
        expectedStateVersion: versions.collectionState(collection),
        expectedVersion: versions.collection(parsed),
        timestamp,
      };
    case "move-block":
      return {
        blockId: intent.sourceBlockId,
        collectionId: intent.collectionId,
        expectedVersion: versions.collection(parsed),
        kind: intent.kind,
        target: moveTarget(intent),
        updatedAt: timestamp,
      };
    case "move-collection":
      return {
        ...intent,
        expectedOrderVersion: versions.order(content),
        timestamp,
      };
    case "rename-collection":
      return {
        ...intent,
        expectedVersion: versions.collection(parsed),
        updatedAt: timestamp,
      };
    case "replace-collection-body":
      return {
        change: createTodoBodyReplacement(
          createTodoCollectionBodyProjection(parsed).source,
          intent.body,
        ),
        collectionId: intent.collectionId,
        expectedVersion: versions.collection(parsed),
        kind: intent.kind,
        updatedAt: timestamp,
      };
    case "set-completion":
      return {
        ...intent,
        completedAt: timestamp,
        expectedStateVersion: versions.itemState(collection, intent.blockId),
        today,
      };
    case "set-recurrence":
      return {
        ...intent,
        expectedStateVersion: versions.itemState(collection, intent.blockId),
        stageId: `todo-recurrence-stage-${createId()}`,
        today,
        updatedAt: timestamp,
      };
    case "stop-recurrence":
      return {
        ...intent,
        expectedStateVersion: versions.itemState(collection, intent.blockId),
        today,
        updatedAt: timestamp,
      };
  }
}

export function prepareAgentTodoCommand({
  intent,
  runtime,
  snapshot,
  versionPolicy,
}: {
  intent: TodoAgentCommandIntent;
  runtime: TodoAgentCommandRuntime;
  snapshot: PreparedVersionedSnapshot<
    TodoContent,
    TodoParseIndex,
    TodoRevision
  >;
  versionPolicy: TodoDomainVersions;
}): AgentPreparedCommand<
  TodoContent,
  TodoParseIndex,
  TodoCommandOutcome,
  TodoRevision
> {
  const now = readCommandRuntimeNow(runtime);
  const mutation = prepareTodoMutation({
    command: toDomainCommand({
      content: snapshot.content,
      createId: runtime.createId,
      index: snapshot.projection,
      intent,
      timestamp: now.timestamp,
      today: runtime.today(now.date),
      versions: versionPolicy,
    }),
    content: snapshot.content,
    createBlockId: runtime.createId,
    index: snapshot.projection,
    versions: versionPolicy,
  });

  return {
    baseRevision: snapshot.revision,
    content: mutation.content,
    destructive: intent.kind === "delete-collection",
    outcome: mutation.outcome,
    projection: mutation.index,
    timestamp: mutation.timestamp,
  };
}
