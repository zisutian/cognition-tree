// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiV1CommandOutcomeDto,
  ApiV1ResourceChangeDto,
  ApiV1TodoCommandDto,
} from "../../../contracts/api/types.ts";
import { createMyersTextEdits } from "../../../core/ctn/metadata/myersTextEdits.ts";
import {
  createTodoCollection,
  deleteTodoCollection,
  moveTodoBlock,
  moveTodoCollection,
  renameTodoCollection,
  setTodoBlockCompletion,
  setTodoBlockRecurrence,
  stopTodoBlockRecurrence,
  TodoOccurrenceConflictError,
  updateTodoCollectionBody,
  type TodoBlockMoveTarget,
} from "../../../core/todo/commands/todoCommands.ts";
import {
  createTodoParseIndex,
} from "../../../core/todo/indexes/todoParseIndex.ts";
import {
  createTodoCollectionBodyProjection,
  isTodoCollectionId,
  type TodoCollection,
  type TodoCollectionId,
  type TodoContent,
} from "../../../core/todo/model/todoContent.ts";
import {
  createDomainChangeSet,
} from "../../../core/sync/domainChangeSet.ts";
import type {
  VersionedContentStore,
} from "../repository/versionedContentStore.ts";
import {
  createTodoRevision,
} from "../repository/todoContentStore.ts";
import {
  executeApiV1VersionedCommand,
  projectApiV1TextEdits,
} from "./apiV1CommandCommon.ts";
import {
  ApiV1RequestError,
  apiV1NotFound,
  assertApiV1ResourceVersion,
} from "./apiV1Errors.ts";
import {
  createParsedTodoCollectionVersion,
  createTodoCollectionStateVersion,
  createTodoItemStateVersion,
  createTodoOrderVersion,
} from "./apiV1Resources.ts";
import {
  readApiV1RuntimeNow,
  type ApiV1Runtime,
} from "./apiV1Runtime.ts";

function asDomainValidation<Result>(operation: () => Result): Result {
  try {
    return operation();
  } catch (error) {
    if (
      error instanceof ApiV1RequestError ||
      error instanceof TodoOccurrenceConflictError
    ) {
      throw error;
    }
    throw new ApiV1RequestError(
      "domain_validation_failed",
      error instanceof Error ? error.message : "Todo command is invalid",
    );
  }
}

function requireCollection(content: TodoContent, collectionId: string) {
  if (!isTodoCollectionId(collectionId)) {
    apiV1NotFound("Todo collection does not exist");
  }
  const collection = content.collections.find(({ id }) => id === collectionId);

  if (!collection) apiV1NotFound("Todo collection does not exist");
  return collection;
}

function todoBody(content: TodoContent, collectionId: string) {
  if (!isTodoCollectionId(collectionId)) return "";
  const parsed = createTodoParseIndex(content).getParsedCollection(
    collectionId,
  );

  return parsed ? createTodoCollectionBodyProjection(parsed).source : "";
}

function todoBlockTarget(
  command: Extract<ApiV1TodoCommandDto, { kind: "move-block" }>,
): TodoBlockMoveTarget {
  if (command.targetKind === "end") {
    if (command.targetBlockId !== null) {
      throw new ApiV1RequestError(
        "domain_validation_failed",
        "End block target must not include targetBlockId",
      );
    }
    return { kind: "end" };
  }
  if (command.targetBlockId === null) {
    apiV1NotFound("Target Todo block does not exist");
  }
  return {
    kind: command.targetKind,
    targetBlockId: command.targetBlockId,
  };
}

function applyTodoCommand(
  content: TodoContent,
  command: ApiV1TodoCommandDto,
  runtime: ApiV1Runtime,
) {
  const { timestamp, today } = readApiV1RuntimeNow(runtime);
  const index = createTodoParseIndex(content);
  let next = content;
  let result: ApiV1CommandOutcomeDto = { kind: "ok" };

  switch (command.kind) {
    case "create-collection": {
      assertApiV1ResourceVersion(
        command.expectedOrderVersion,
        createTodoOrderVersion(content),
        "collections",
      );
      const collectionId = `todo-collection-${runtime.createId()}` as const;
      const created = createTodoCollection(content, index, {
        collectionId,
        createBlockId: runtime.createId,
        createdAt: timestamp,
        name: command.name,
      });

      next = created.content;
      if (command.body !== "") {
        const createdIndex = createTodoParseIndex(
          next,
          index,
          new Map([[collectionId, created.analysis]]),
        );
        const updated = updateTodoCollectionBody(next, createdIndex, {
          change: {
            edits: createMyersTextEdits("", command.body),
            source: command.body,
          },
          collectionId,
          createBlockId: runtime.createId,
          updatedAt: timestamp,
        });

        next = updated.content;
      }
      result = { collectionId, kind: "todo-collection-created" };
      break;
    }
    case "delete-collection": {
      const collection = requireCollection(content, command.collectionId);
      const parsed = index.getParsedCollection(collection.id)!;

      assertApiV1ResourceVersion(
        command.expectedVersion,
        createParsedTodoCollectionVersion(parsed),
        collection.id,
      );
      assertApiV1ResourceVersion(
        command.expectedStateVersion,
        createTodoCollectionStateVersion(collection),
        `${collection.id}/state`,
      );
      next = deleteTodoCollection(content, collection.id);
      break;
    }
    case "move-block": {
      const collection = requireCollection(content, command.collectionId);
      const parsed = index.getParsedCollection(collection.id)!;

      assertApiV1ResourceVersion(
        command.expectedVersion,
        createParsedTodoCollectionVersion(parsed),
        collection.id,
      );
      const moved = moveTodoBlock(content, index, {
        blockId: command.sourceBlockId,
        collectionId: collection.id,
        target: todoBlockTarget(command),
        updatedAt: timestamp,
      });

      next = moved.content;
      break;
    }
    case "move-collection": {
      const collection = requireCollection(content, command.collectionId);

      assertApiV1ResourceVersion(
        command.expectedOrderVersion,
        createTodoOrderVersion(content),
        "collections",
      );
      next = moveTodoCollection(content, {
        collectionId: collection.id,
        toIndex: command.toIndex,
      });
      break;
    }
    case "rename-collection": {
      const collection = requireCollection(content, command.collectionId);
      const parsed = index.getParsedCollection(collection.id)!;

      assertApiV1ResourceVersion(
        command.expectedVersion,
        createParsedTodoCollectionVersion(parsed),
        collection.id,
      );
      next = renameTodoCollection(content, index, {
        collectionId: collection.id,
        name: command.name,
        updatedAt: timestamp,
      });
      break;
    }
    case "replace-collection-body": {
      const collection = requireCollection(content, command.collectionId);
      const parsed = index.getParsedCollection(collection.id)!;

      assertApiV1ResourceVersion(
        command.expectedVersion,
        createParsedTodoCollectionVersion(parsed),
        collection.id,
      );
      const previousBody = createTodoCollectionBodyProjection(parsed).source;
      const updated = updateTodoCollectionBody(content, index, {
        change: {
          edits: createMyersTextEdits(previousBody, command.body),
          source: command.body,
        },
        collectionId: collection.id,
        createBlockId: runtime.createId,
        updatedAt: timestamp,
      });

      next = updated.content;
      break;
    }
    case "set-completion": {
      const collection = requireCollection(content, command.collectionId);

      assertApiV1ResourceVersion(
        command.expectedStateVersion,
        createTodoItemStateVersion(collection, command.blockId),
        `${collection.id}/items/${command.blockId}/state`,
      );
      next = setTodoBlockCompletion(content, index, {
        blockId: command.blockId,
        collectionId: collection.id,
        completed: command.completed,
        completedAt: timestamp,
        occurrenceDate: command.occurrenceDate,
        today,
      });
      break;
    }
    case "set-recurrence": {
      const collection = requireCollection(content, command.collectionId);

      assertApiV1ResourceVersion(
        command.expectedStateVersion,
        createTodoItemStateVersion(collection, command.blockId),
        `${collection.id}/items/${command.blockId}/state`,
      );
      next = setTodoBlockRecurrence(content, index, {
        blockId: command.blockId,
        collectionId: collection.id,
        rule: command.rule,
        stageId: `todo-recurrence-stage-${runtime.createId()}`,
        today,
        updatedAt: timestamp,
      });
      break;
    }
    case "stop-recurrence": {
      const collection = requireCollection(content, command.collectionId);

      assertApiV1ResourceVersion(
        command.expectedStateVersion,
        createTodoItemStateVersion(collection, command.blockId),
        `${collection.id}/items/${command.blockId}/state`,
      );
      next = stopTodoBlockRecurrence(content, index, {
        blockId: command.blockId,
        collectionId: collection.id,
        today,
        updatedAt: timestamp,
      });
      break;
    }
  }
  return { next, result, timestamp };
}

function itemStateVersions(collection: TodoCollection) {
  const blockIds = new Set([
    ...collection.completions.map(({ blockId }) => blockId),
    ...collection.recurrences.map(({ blockId }) => blockId),
  ]);

  return new Map(
    [...blockIds].map((blockId) => [
      blockId,
      createTodoItemStateVersion(collection, blockId),
    ]),
  );
}

export function projectApiV1TodoChanges(
  before: TodoContent,
  after: TodoContent,
  timestamp: string,
) {
  const beforeIndex = createTodoParseIndex(before);
  const afterIndex = createTodoParseIndex(after, beforeIndex);
  const beforeCollections = new Map(
    before.collections.map((collection, order) => [
      collection.id,
      { collection, order },
    ]),
  );
  const afterCollections = new Map(
    after.collections.map((collection, order) => [
      collection.id,
      { collection, order },
    ]),
  );
  const resources: ApiV1ResourceChangeDto[] = [];
  const changedCollectionIds = new Set<TodoCollectionId>();
  const stateChangedByCollection = new Map<TodoCollectionId, Set<string>>();

  for (const [id] of beforeCollections) {
    if (!afterCollections.has(id)) {
      changedCollectionIds.add(id);
      resources.push({
        domain: "todo",
        kind: "deleted",
        resourceId: id,
      });
    }
  }
  for (const [id, current] of afterCollections) {
    const previous = beforeCollections.get(id);
    const parsed = afterIndex.getParsedCollection(id)!;
    const version = createParsedTodoCollectionVersion(parsed);

    if (!previous) {
      changedCollectionIds.add(id);
      resources.push({
        domain: "todo",
        kind: "created",
        resourceId: id,
        version,
      });
      continue;
    }
    if (
      createParsedTodoCollectionVersion(
        beforeIndex.getParsedCollection(id)!,
      ) !== version
    ) {
      changedCollectionIds.add(id);
      resources.push({
        domain: "todo",
        kind: "updated",
        resourceId: id,
        version,
      });
    }
    if (previous.order !== current.order) {
      resources.push({
        domain: "todo",
        kind: "moved",
        resourceId: id,
        version,
      });
    }
    const previousStates = itemStateVersions(previous.collection);
    const nextStates = itemStateVersions(current.collection);
    const blockIds = new Set([
      ...previousStates.keys(),
      ...nextStates.keys(),
    ]);

    for (const blockId of blockIds) {
      const previousVersion = previousStates.get(blockId) ??
        createTodoItemStateVersion(previous.collection, blockId);
      const nextVersion = nextStates.get(blockId) ??
        createTodoItemStateVersion(current.collection, blockId);

      if (previousVersion === nextVersion) continue;
      changedCollectionIds.add(id);
      const changed = stateChangedByCollection.get(id) ?? new Set<string>();

      changed.add(blockId);
      stateChangedByCollection.set(id, changed);
      resources.push({
        domain: "todo",
        kind: "updated",
        resourceId: `${id}/items/${blockId}/state`,
        version: nextVersion,
      });
    }
  }
  const beforeOrder = createTodoOrderVersion(before);
  const afterOrder = createTodoOrderVersion(after);

  if (beforeOrder !== afterOrder) {
    resources.push({
      domain: "todo",
      kind: "updated",
      resourceId: "collections",
      version: afterOrder,
    });
  }
  const blocks = [...changedCollectionIds].flatMap((collectionId) => {
    const previous = beforeIndex.getParsedCollection(collectionId);
    const next = afterIndex.getParsedCollection(collectionId);

    return createDomainChangeSet({
      next: next
        ? {
            document: next.analysis.document,
            domain: "todo",
            resourceId: collectionId,
            stateChangedBlockIds: stateChangedByCollection.get(collectionId),
            version: createParsedTodoCollectionVersion(next),
          }
        : null,
      occurredAt: timestamp,
      previous: previous
        ? {
            document: previous.analysis.document,
            domain: "todo",
            resourceId: collectionId,
            version: createParsedTodoCollectionVersion(previous),
          }
        : null,
    }).blocks;
  });
  const diff = [...changedCollectionIds].flatMap((collectionId) =>
    projectApiV1TextEdits(
      collectionId,
      createMyersTextEdits(
        todoBody(before, collectionId),
        todoBody(after, collectionId),
      ),
    )
  );

  return {
    changes: { blocks, occurredAt: timestamp, resources },
    diff,
  };
}

export async function executeApiV1TodoCommand({
  command,
  runtime,
  store,
}: {
  command: ApiV1TodoCommandDto;
  runtime: ApiV1Runtime;
  store: VersionedContentStore<TodoContent>;
}) {
  const now = readApiV1RuntimeNow(runtime);
  const allocatedIds: string[] = [];

  return executeApiV1VersionedCommand({
    apply(content) {
      let nextId = 0;
      const replayRuntime: ApiV1Runtime = {
        ...runtime,
        createId() {
          allocatedIds[nextId] ??= runtime.createId();
          return allocatedIds[nextId++]!;
        },
        now: () => new Date(now.date),
      };
      const applied = asDomainValidation(() =>
        applyTodoCommand(content, command, replayRuntime)
      );
      const projection = projectApiV1TodoChanges(
        content,
        applied.next,
        applied.timestamp,
      );

      return {
        ...projection,
        content: applied.next,
        result: applied.result,
        revision: createTodoRevision(applied.next),
      };
    },
    mode: command.mode,
    store,
  });
}
