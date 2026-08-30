// SPDX-License-Identifier: GPL-3.0-or-later

import { createMyersTextEdits } from "../../../core/ctn/metadata/myersTextEdits.ts";
import { createPortableNameKey } from "../../../core/naming/portableName.ts";
import {
  createTodoCollection,
  updateTodoCollectionBody,
} from "../../../core/todo/commands/todoCollectionCommands.ts";
import {
  createTodoParseIndex,
  type TodoParseIndex,
} from "../../../core/todo/indexes/todoParseIndex.ts";
import type {
  TodoCollectionId,
  TodoContent,
} from "../../../core/todo/model/todoContent.ts";
import { createTodoCollectionBodyProjection } from "../../../core/todo/model/todoCollectionProjection.ts";
import type { PreparedVersionedContent } from "../../persistence/versionedRepository.ts";

export type TodoConflictRecoveryDependencies = {
  createBlockId(): string;
  createTodoCollectionId(): TodoCollectionId;
  now(): string;
};

function todoConflictCollectionIds(unitIds: readonly string[]) {
  const prefix = "todo:collection:";
  const suffix = ":body";

  return unitIds.map((unitId) => {
    const collectionId = unitId.startsWith(prefix) && unitId.endsWith(suffix)
      ? unitId.slice(prefix.length, -suffix.length)
      : "";

    if (!collectionId) {
      throw new Error(`当前冲突单元无法无损另存：${unitId}`);
    }
    return collectionId as TodoCollectionId;
  });
}

function createRecoveryCollectionName(
  index: TodoParseIndex,
  localName: string,
) {
  const names = new Set(
    index.collections.map(({ name }) => createPortableNameKey(name)),
  );

  for (let index = 1; index <= 10_000; index += 1) {
    const candidate = `${localName} 本地恢复副本 ${index}`;

    if (!names.has(createPortableNameKey(candidate))) return candidate;
  }
  throw new Error("无法为 Todo 恢复副本生成唯一名称。");
}

export function recoverTodoLocalConflictCopies(
  selected: PreparedVersionedContent<TodoContent, TodoParseIndex>,
  conflict: Readonly<{ unitIds: readonly string[] }>,
  dependencies: TodoConflictRecoveryDependencies,
  localPrepared: PreparedVersionedContent<TodoContent, TodoParseIndex>,
) {
  const localIndex = localPrepared.projection;
  const recoverableCollections = todoConflictCollectionIds(conflict.unitIds)
    .map((sourceCollectionId) => {
      const localCollection = localIndex.getParsedCollection(
        sourceCollectionId,
      );

      if (!localCollection) {
        throw new Error(`本地冲突清单不可用于另存：${sourceCollectionId}`);
      }
      return localCollection;
    });
  let next = selected.content;
  let currentIndex = selected.projection;
  let recovered = 0;

  for (const localCollection of recoverableCollections) {
    const body = createTodoCollectionBodyProjection(localCollection).source;
    const timestamp = dependencies.now();
    const collectionId = dependencies.createTodoCollectionId();
    const created = createTodoCollection(next, currentIndex, {
      collectionId,
      createBlockId: dependencies.createBlockId,
      createdAt: timestamp,
      name: createRecoveryCollectionName(currentIndex, localCollection.name),
    });
    const createdIndex = createTodoParseIndex(
      created.content,
      currentIndex,
      new Map([[collectionId, created.analysis]]),
    );
    const updated = updateTodoCollectionBody(created.content, createdIndex, {
      change: {
        edits: createMyersTextEdits("", body),
        source: body,
      },
      collectionId,
      createBlockId: dependencies.createBlockId,
      updatedAt: timestamp,
    });

    next = updated.content;
    currentIndex = createTodoParseIndex(
      next,
      createdIndex,
      new Map([[collectionId, updated.analysis]]),
    );
    recovered += 1;
  }
  if (recovered !== conflict.unitIds.length || recovered === 0) {
    throw new Error("当前冲突不包含可另存的本地正文。");
  }
  return {
    coveredUnitIds: [...conflict.unitIds],
    prepared: { content: next, projection: currentIndex },
  };
}
