// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnCanonicalSourceAnalysis,
} from "../../core/ctn/analysis/sourceAnalysis.ts";
import {
  createMyersTextEdits,
} from "../../core/ctn/metadata/myersTextEdits.ts";
import type {
  CtnEditableSourceChange,
} from "../../core/ctn/metadata/textEdits.ts";
import { DomainNotFoundError } from "../../core/errors/domainErrors.ts";
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
  type TodoBlockMoveTarget,
} from "../../core/todo/commands/todoCommands.ts";
import {
  createTodoParseIndex,
  type ParsedTodoIndexCollection,
  type TodoParseIndex,
} from "../../core/todo/indexes/todoParseIndex.ts";
import {
  createTodoCollectionBodyProjection,
  isTodoCollectionId,
  type TodoCollection,
  type TodoCollectionId,
  type TodoContent,
} from "../../core/todo/model/todoContent.ts";
import type {
  TodoLocalDate,
  TodoRecurrenceRule,
  TodoRecurrenceStageId,
} from "../../core/todo/recurrence/todoRecurrence.ts";
import {
  createDomainChangeSet,
  type DomainResourceChange,
} from "../../core/sync/domainChangeSet.ts";
import {
  assertDomainResourceVersion,
  projectDomainTextEdits,
  type DomainCommandOutcome,
  type DomainMutationProjection,
} from "../commands/domainCommand.ts";

type ResourceVersion = `sha256:${string}`;

export type TodoDomainVersions = {
  collection(parsed: ParsedTodoIndexCollection): ResourceVersion;
  collectionState(collection: TodoCollection): ResourceVersion;
  itemState(collection: TodoCollection, blockId: string): ResourceVersion;
  order(content: TodoContent): ResourceVersion;
};

type TodoCollectionVersionTarget = {
  collectionId: string;
  expectedVersion?: ResourceVersion;
};

type TodoItemStateVersionTarget = {
  blockId: string;
  collectionId: string;
  expectedStateVersion?: ResourceVersion;
};

export type TodoDomainCommand =
  | {
      body: string;
      collectionId: TodoCollectionId;
      createdAt: string;
      expectedOrderVersion?: ResourceVersion;
      kind: "create-collection";
      name: string;
    }
  | (TodoCollectionVersionTarget & {
      expectedStateVersion?: ResourceVersion;
      kind: "delete-collection";
      timestamp: string;
    })
  | (TodoCollectionVersionTarget & {
      blockId: string;
      kind: "move-block";
      target: TodoBlockMoveTarget;
      updatedAt: string;
    })
  | {
      collectionId: string;
      expectedOrderVersion?: ResourceVersion;
      kind: "move-collection";
      timestamp: string;
      toIndex: number;
    }
  | (TodoCollectionVersionTarget & {
      kind: "rename-collection";
      name: string;
      updatedAt: string;
    })
  | (TodoCollectionVersionTarget & {
      change: CtnEditableSourceChange;
      kind: "replace-collection-body";
      updatedAt: string;
    })
  | (TodoItemStateVersionTarget & {
      completed: boolean;
      completedAt: string;
      kind: "set-completion";
      occurrenceDate: TodoLocalDate | null;
      today: TodoLocalDate;
    })
  | (TodoItemStateVersionTarget & {
      kind: "set-recurrence";
      rule: TodoRecurrenceRule;
      stageId: TodoRecurrenceStageId;
      today: TodoLocalDate;
      updatedAt: string;
    })
  | (TodoItemStateVersionTarget & {
      kind: "stop-recurrence";
      today: TodoLocalDate;
      updatedAt: string;
    })
  | {
      blockId: string;
      collectionId: string;
      completedAt: string;
      kind: "toggle-completion";
      today: TodoLocalDate;
    };

export type PreparedTodoMutation = {
  analysisOverrides?: ReadonlyMap<
    TodoCollectionId,
    CtnCanonicalSourceAnalysis
  >;
  content: TodoContent;
  index: TodoParseIndex;
  outcome: DomainCommandOutcome;
  timestamp: string;
};

function requireParsedCollection(
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
  const collection = content.collections.find(({ id }) => id === collectionId);
  const parsed = index.getParsedCollection(collectionId);

  if (!collection || !parsed) {
    throw new DomainNotFoundError(
      collectionId,
      "Todo collection does not exist",
    );
  }
  return { collection, parsed };
}

function assertCollectionVersion(
  command: TodoCollectionVersionTarget,
  parsed: ParsedTodoIndexCollection,
  versions?: TodoDomainVersions,
) {
  if (!versions) return;
  assertDomainResourceVersion(
    command.expectedVersion,
    versions.collection(parsed),
    parsed.collection.id,
  );
}

function assertItemStateVersion(
  command: TodoItemStateVersionTarget,
  collection: TodoCollection,
  versions?: TodoDomainVersions,
) {
  if (!versions) return;
  assertDomainResourceVersion(
    command.expectedStateVersion,
    versions.itemState(collection, command.blockId),
    `${collection.id}/items/${command.blockId}/state`,
  );
}

export function createTodoBodyReplacement(
  previousBody: string,
  body: string,
): CtnEditableSourceChange {
  return {
    edits: createMyersTextEdits(previousBody, body),
    source: body,
  };
}

export function prepareTodoMutation({
  command,
  content,
  createBlockId,
  index: preparedIndex,
  versions,
}: {
  command: TodoDomainCommand;
  content: TodoContent;
  createBlockId: () => string;
  index?: TodoParseIndex;
  versions?: TodoDomainVersions;
}): PreparedTodoMutation {
  const index = preparedIndex ?? createTodoParseIndex(content);
  let next: TodoContent;
  let analysisOverrides:
    | ReadonlyMap<TodoCollectionId, CtnCanonicalSourceAnalysis>
    | undefined;
  let outcome: DomainCommandOutcome = { kind: "ok" };
  let timestamp: string;

  switch (command.kind) {
    case "create-collection": {
      if (versions) {
        assertDomainResourceVersion(
          command.expectedOrderVersion,
          versions.order(content),
          "collections",
        );
      }
      const created = createTodoCollection(content, index, {
        collectionId: command.collectionId,
        createBlockId,
        createdAt: command.createdAt,
        name: command.name,
      });

      next = created.content;
      let analysis = created.analysis;
      if (command.body !== "") {
        const createdIndex = createTodoParseIndex(
          next,
          index,
          new Map([[command.collectionId, analysis]]),
        );
        const updated = updateTodoCollectionBody(next, createdIndex, {
          change: createTodoBodyReplacement("", command.body),
          collectionId: command.collectionId,
          createBlockId,
          updatedAt: command.createdAt,
        });

        next = updated.content;
        analysis = updated.analysis;
      }
      analysisOverrides = new Map([[command.collectionId, analysis]]);
      outcome = {
        collectionId: command.collectionId,
        kind: "todo-collection-created",
      };
      timestamp = command.createdAt;
      break;
    }
    case "delete-collection": {
      const { collection, parsed } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      assertCollectionVersion(command, parsed, versions);
      if (versions) {
        assertDomainResourceVersion(
          command.expectedStateVersion,
          versions.collectionState(collection),
          `${collection.id}/state`,
        );
      }
      next = deleteTodoCollection(content, collection.id);
      timestamp = command.timestamp;
      break;
    }
    case "move-block": {
      const { parsed } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      assertCollectionVersion(command, parsed, versions);
      const moved = moveTodoBlock(content, index, {
        blockId: command.blockId,
        collectionId: parsed.collection.id,
        target: command.target,
        updatedAt: command.updatedAt,
      });

      next = moved.content;
      analysisOverrides = new Map([
        [parsed.collection.id, moved.analysis],
      ]);
      timestamp = command.updatedAt;
      break;
    }
    case "move-collection": {
      const { collection } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      if (versions) {
        assertDomainResourceVersion(
          command.expectedOrderVersion,
          versions.order(content),
          "collections",
        );
      }
      next = moveTodoCollection(content, {
        collectionId: collection.id,
        toIndex: command.toIndex,
      });
      timestamp = command.timestamp;
      break;
    }
    case "rename-collection": {
      const { parsed } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      assertCollectionVersion(command, parsed, versions);
      next = renameTodoCollection(content, index, {
        collectionId: parsed.collection.id,
        name: command.name,
        updatedAt: command.updatedAt,
      });
      timestamp = command.updatedAt;
      break;
    }
    case "replace-collection-body": {
      const { parsed } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      assertCollectionVersion(command, parsed, versions);
      const updated = updateTodoCollectionBody(content, index, {
        change: command.change,
        collectionId: parsed.collection.id,
        createBlockId,
        updatedAt: command.updatedAt,
      });

      next = updated.content;
      analysisOverrides = new Map([
        [parsed.collection.id, updated.analysis],
      ]);
      timestamp = command.updatedAt;
      break;
    }
    case "set-completion": {
      const { collection } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      assertItemStateVersion(command, collection, versions);
      next = setTodoBlockCompletion(content, index, {
        blockId: command.blockId,
        collectionId: collection.id,
        completed: command.completed,
        completedAt: command.completedAt,
        occurrenceDate: command.occurrenceDate,
        today: command.today,
      });
      timestamp = command.completedAt;
      break;
    }
    case "set-recurrence": {
      const { collection } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      assertItemStateVersion(command, collection, versions);
      next = setTodoBlockRecurrence(content, index, {
        blockId: command.blockId,
        collectionId: collection.id,
        rule: command.rule,
        stageId: command.stageId,
        today: command.today,
        updatedAt: command.updatedAt,
      });
      timestamp = command.updatedAt;
      break;
    }
    case "stop-recurrence": {
      const { collection } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      assertItemStateVersion(command, collection, versions);
      next = stopTodoBlockRecurrence(content, index, {
        blockId: command.blockId,
        collectionId: collection.id,
        today: command.today,
        updatedAt: command.updatedAt,
      });
      timestamp = command.updatedAt;
      break;
    }
    case "toggle-completion": {
      const { collection } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      next = toggleTodoBlock(content, index, {
        blockId: command.blockId,
        collectionId: collection.id,
        completedAt: command.completedAt,
        today: command.today,
      });
      timestamp = command.completedAt;
      break;
    }
  }
  return {
    analysisOverrides,
    content: next,
    index: createTodoParseIndex(next, index, analysisOverrides),
    outcome,
    timestamp,
  };
}

function todoBody(index: TodoParseIndex, collectionId: string) {
  if (!isTodoCollectionId(collectionId)) return "";
  const parsed = index.getParsedCollection(collectionId);

  return parsed ? createTodoCollectionBodyProjection(parsed).source : "";
}

function itemStateVersions(
  collection: TodoCollection,
  versions: TodoDomainVersions,
) {
  const blockIds = new Set([
    ...collection.completions.map(({ blockId }) => blockId),
    ...collection.recurrences.map(({ blockId }) => blockId),
  ]);

  return new Map(
    [...blockIds].map((blockId) => [
      blockId,
      versions.itemState(collection, blockId),
    ]),
  );
}

export function projectTodoMutation({
  after,
  before,
  timestamp,
  versions,
  afterIndex: preparedAfterIndex,
  beforeIndex: preparedBeforeIndex,
}: {
  after: TodoContent;
  afterIndex?: TodoParseIndex;
  before: TodoContent;
  beforeIndex?: TodoParseIndex;
  timestamp: string;
  versions: TodoDomainVersions;
}): DomainMutationProjection {
  const beforeIndex = preparedBeforeIndex ?? createTodoParseIndex(before);
  const afterIndex = preparedAfterIndex ??
    createTodoParseIndex(after, beforeIndex);
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
  const resources: DomainResourceChange[] = [];
  const changedCollectionIds = new Set<TodoCollectionId>();
  const stateChangedByCollection = new Map<TodoCollectionId, Set<string>>();

  for (const [id] of beforeCollections) {
    if (afterCollections.has(id)) continue;
    changedCollectionIds.add(id);
    resources.push({ domain: "todo", kind: "deleted", resourceId: id });
  }
  for (const [id, current] of afterCollections) {
    const previous = beforeCollections.get(id);
    const parsed = afterIndex.getParsedCollection(id)!;
    const version = versions.collection(parsed);

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
    const previousParsed = beforeIndex.getParsedCollection(id)!;
    if (versions.collection(previousParsed) !== version) {
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
    const previousStates = itemStateVersions(previous.collection, versions);
    const nextStates = itemStateVersions(current.collection, versions);
    const blockIds = new Set([
      ...previousStates.keys(),
      ...nextStates.keys(),
    ]);

    for (const blockId of blockIds) {
      const previousVersion = previousStates.get(blockId) ??
        versions.itemState(previous.collection, blockId);
      const nextVersion = nextStates.get(blockId) ??
        versions.itemState(current.collection, blockId);

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
  const beforeOrder = versions.order(before);
  const afterOrder = versions.order(after);

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
            version: versions.collection(next),
          }
        : null,
      occurredAt: timestamp,
      previous: previous
        ? {
            document: previous.analysis.document,
            domain: "todo",
            resourceId: collectionId,
            version: versions.collection(previous),
          }
        : null,
    }).blocks;
  });
  const diff = [...changedCollectionIds].flatMap((collectionId) =>
    projectDomainTextEdits(
      collectionId,
      createMyersTextEdits(
        todoBody(beforeIndex, collectionId),
        todoBody(afterIndex, collectionId),
      ),
    )
  );

  return {
    changes: { blocks, occurredAt: timestamp, resources },
    diff,
  };
}
