// SPDX-License-Identifier: GPL-3.0-or-later

import {
  moveCtnContentSubtree,
  CtnContentBlockNotFoundError,
  type CtnContentMoveTarget,
} from "../../ctn/index.ts";
import { DomainNotFoundError } from "../../errors/index.ts";
import type { TodoParseIndex } from "../indexes/todoParseIndex.ts";
import type {
  TodoCollectionId,
  TodoContent,
} from "../model/todoContent.ts";
import {
  findTodoCollectionIndex,
  readTodoCommandTimestamp,
  replaceTodoCollection,
} from "./todoCommandSupport.ts";

export type TodoBlockMoveTarget = CtnContentMoveTarget;

export type MoveTodoBlockInput = {
  blockId: string;
  collectionId: TodoCollectionId;
  target: TodoBlockMoveTarget;
  updatedAt: string;
};

export function moveTodoBlock(
  content: TodoContent,
  index: TodoParseIndex,
  input: MoveTodoBlockInput,
) {
  const collectionIndex = findTodoCollectionIndex(
    content,
    input.collectionId,
  );
  const collection = content.collections[collectionIndex];
  const parsed = index.getParsedCollection(input.collectionId);

  if (!parsed || parsed.collection.source !== collection.source) {
    throw new Error(
      `Todo collection analysis is stale: ${input.collectionId}`,
    );
  }
  readTodoCommandTimestamp(input.updatedAt, "Todo block updatedAt");
  let result: ReturnType<typeof moveCtnContentSubtree>;
  try { result = moveCtnContentSubtree(parsed.analysis, input.blockId, input.target, input.updatedAt); }
  catch (error) {
    if (error instanceof CtnContentBlockNotFoundError) throw new DomainNotFoundError(error.blockId, `Todo ${error.blockId === input.blockId ? "source" : "target"} block does not exist: ${error.blockId}`);
    throw error;
  }

  return {
    analysis: result.analysis,
    content: replaceTodoCollection(content, collectionIndex, {
      ...collection,
      source: result.nextText,
    }),
  };
}
