// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnCanonicalSourceAnalysis,
} from "../../ctn/analysis/sourceAnalysis.ts";
import { touchCtnSourceBlockMetadata } from "../../ctn/metadata/sourceMetadata.ts";
import type { CtnCanonicalBlock } from "../../ctn/parser/types.ts";
import {
  DomainNotFoundError,
  DomainValidationError,
} from "../../errors/domainErrors.ts";
import type { TodoParseIndex } from "../indexes/todoParseIndex.ts";
import {
  todoItemSemanticType,
  type TodoCollection,
  type TodoCollectionId,
  type TodoContent,
} from "../model/todoContent.ts";

export function readTodoCommandTimestamp(value: string, label: string) {
  const milliseconds = Date.parse(value);

  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new DomainValidationError(
      `${label} must be a canonical ISO timestamp.`,
    );
  }
  return milliseconds;
}

export function findTodoCollectionIndex(
  content: TodoContent,
  collectionId: TodoCollectionId,
) {
  const index = content.collections.findIndex(({ id }) => id === collectionId);

  if (index < 0) {
    throw new DomainNotFoundError(
      collectionId,
      `Todo collection does not exist: ${collectionId}`,
    );
  }
  return index;
}

export function replaceTodoCollection(
  content: TodoContent,
  collectionIndex: number,
  collection: TodoCollection,
) {
  const collections = [...content.collections];

  collections[collectionIndex] = collection;
  return { ...content, collections };
}

export function cleanTodoCollectionSidecars(
  collection: TodoCollection,
  analysis: CtnCanonicalSourceAnalysis,
) {
  const itemIds = new Set(
    analysis.document.blocks
      .filter(
        (block) => block.rule.semanticId === todoItemSemanticType,
      )
      .map(({ id }) => id),
  );

  return {
    ...collection,
    completions: collection.completions.filter(({ blockId }) =>
      itemIds.has(blockId)
    ),
    recurrences: collection.recurrences.filter(({ blockId }) =>
      itemIds.has(blockId)
    ),
  };
}

export function requireTodoItemBlock(
  index: TodoParseIndex,
  collectionId: TodoCollectionId,
  blockId: string,
) {
  const parsed = index.getParsedCollection(collectionId);
  const block = parsed?.analysis.document.blocks.find(
    ({ id }) => id === blockId,
  );

  if (!block || block.rule.semanticId !== todoItemSemanticType) {
    throw new DomainNotFoundError(
      blockId,
      `Todo item block does not exist: ${blockId}`,
    );
  }
  return block;
}

export function replaceTodoCollectionWithTouchedBlock(
  content: TodoContent,
  collectionIndex: number,
  collection: TodoCollection,
  block: CtnCanonicalBlock,
  updatedAt: string,
) {
  readTodoCommandTimestamp(updatedAt, "Todo block updatedAt");
  return replaceTodoCollection(content, collectionIndex, {
    ...collection,
    source: touchCtnSourceBlockMetadata(
      collection.source,
      block,
      updatedAt,
    ),
  });
}
