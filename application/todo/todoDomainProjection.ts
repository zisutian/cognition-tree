// SPDX-License-Identifier: GPL-3.0-or-later

import { createMyersTextEdits } from "../../core/ctn/metadata/myersTextEdits.ts";
import {
  createTodoParseIndex,
  type TodoParseIndex,
} from "../../core/todo/indexes/todoParseIndex.ts";
import {
  createTodoCollectionBodyProjection,
  isTodoCollectionId,
  type TodoCollection,
  type TodoCollectionId,
  type TodoContent,
} from "../../core/todo/model/todoContent.ts";
import {
  createDomainChangeSet,
  type DomainResourceChange,
} from "../../core/sync/domainChangeSet.ts";
import {
  projectDomainTextEdits,
  type DomainMutationProjection,
} from "../commands/domainCommand.ts";
import type { TodoDomainVersions } from "./todoDomainCommands.ts";

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
