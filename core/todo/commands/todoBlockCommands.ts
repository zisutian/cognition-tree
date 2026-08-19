// SPDX-License-Identifier: GPL-3.0-or-later

import {
  moveCtnBlockWithinText,
  type CtnBlockTextTargetPosition,
} from "../../ctn/parser/blockTextEdit.ts";
import type { CtnCanonicalBlock } from "../../ctn/parser/types.ts";
import { DomainNotFoundError } from "../../errors/domainErrors.ts";
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

export type TodoBlockMoveTarget =
  | { kind: "end" }
  | {
      kind: "inside" | "above" | "below";
      targetBlockId: string;
    };

export type MoveTodoBlockInput = {
  blockId: string;
  collectionId: TodoCollectionId;
  target: TodoBlockMoveTarget;
  updatedAt: string;
};

function blockRange(block: CtnCanonicalBlock) {
  return {
    indentText: block.indentText,
    level: block.level,
    lineNumber: block.lineNumber,
    metadataLineNumber: block.metadataLineNumber,
    subtreeEndLineNumber: block.subtreeEndLineNumber,
  };
}

function resolveMoveTarget(
  input: MoveTodoBlockInput,
  blocks: ReadonlyMap<string, CtnCanonicalBlock>,
): CtnBlockTextTargetPosition {
  if (input.target.kind === "end") return input.target;
  const target = blocks.get(input.target.targetBlockId);

  if (!target || target.rule.semanticId === "title") {
    throw new DomainNotFoundError(
      input.target.targetBlockId,
      `Todo target block does not exist: ${input.target.targetBlockId}`,
    );
  }
  return {
    block: blockRange(target),
    kind: input.target.kind === "inside"
      ? "inside-block"
      : input.target.kind === "above"
        ? "sibling-above"
        : "sibling-below",
  };
}

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
  const syntax = index.syntax;
  const parsed = index.getParsedCollection(input.collectionId);

  if (!parsed || parsed.collection.source !== collection.source) {
    throw new Error(
      `Todo collection analysis is stale: ${input.collectionId}`,
    );
  }
  const blocks = new Map(
    parsed.analysis.document.blocks.map((block) => [block.id, block]),
  );
  const sourceBlock = blocks.get(input.blockId);

  if (
    !sourceBlock ||
    sourceBlock.rule.semanticId === syntax.title.semanticId
  ) {
    throw new DomainNotFoundError(
      input.blockId,
      `Todo source block does not exist: ${input.blockId}`,
    );
  }
  readTodoCommandTimestamp(input.updatedAt, "Todo block updatedAt");
  const result = moveCtnBlockWithinText({
    analysis: parsed.analysis,
    sourceBlock: blockRange(sourceBlock),
    targetPosition: resolveMoveTarget(input, blocks),
    updatedAt: input.updatedAt,
  });

  return {
    analysis: result.analysis,
    content: replaceTodoCollection(content, collectionIndex, {
      ...collection,
      source: result.nextText,
    }),
  };
}
