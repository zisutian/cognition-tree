// SPDX-License-Identifier: GPL-3.0-or-later

import {
  analyzeCtnSource,
  type CtnCanonicalSourceAnalysis,
} from "../../ctn/analysis/sourceAnalysis.ts";
import { createCtnBlockIdAllocator } from "../../ctn/metadata/blockIdAllocator.ts";
import {
  recanonicalizeCtnSourceBlockMetadata,
} from "../../ctn/metadata/reconcileSourceMetadata.ts";
import { requireCtnSyntax } from "../../ctn/syntax/compiler.ts";
import type { TodoParseIndex } from "../indexes/todoParseIndex.ts";
import type {
  TodoCollectionId,
  TodoContent,
} from "../model/todoContent.ts";
import {
  cleanTodoCollectionSidecars,
  readTodoCommandTimestamp,
} from "./todoCommandSupport.ts";

export type UpdateTodoSyntaxSourceInput = {
  createBlockId: () => string;
  source: string;
  updatedAt: string;
};

export function updateTodoSyntaxSource(
  content: TodoContent,
  index: TodoParseIndex,
  input: UpdateTodoSyntaxSourceInput,
) {
  if (content.syntaxSource === input.source) {
    return {
      analysisOverrides:
        new Map<TodoCollectionId, CtnCanonicalSourceAnalysis>(),
      content,
    };
  }
  readTodoCommandTimestamp(input.updatedAt, "Todo syntax updatedAt");
  const syntax = requireCtnSyntax(input.source, "todo");

  if (syntax.blockGrammarKey === index.syntax.blockGrammarKey) {
    return {
      analysisOverrides:
        new Map<TodoCollectionId, CtnCanonicalSourceAnalysis>(),
      content: { ...content, syntaxSource: input.source },
    };
  }
  const allocator = createCtnBlockIdAllocator(
    input.createBlockId,
    index.blockIds,
  );
  const analysisOverrides =
    new Map<TodoCollectionId, CtnCanonicalSourceAnalysis>();
  const collections = content.collections.map((collection) => {
    const previous = index.getParsedCollection(collection.id);

    if (!previous || previous.collection.source !== collection.source) {
      throw new Error(
        `Todo collection analysis is stale: ${collection.id}`,
      );
    }
    const candidate = analyzeCtnSource({
      mode: { kind: "editable-document" },
      source: previous.analysis.editableProjection.source,
      syntax,
    });
    const reconciled = recanonicalizeCtnSourceBlockMetadata(
      previous.analysis,
      candidate,
      {
        allocateId: allocator.allocate,
        timestamp: input.updatedAt,
        touchTitle: false,
      },
    );

    analysisOverrides.set(collection.id, reconciled.analysis);
    return cleanTodoCollectionSidecars(
      { ...collection, source: reconciled.source },
      reconciled.analysis,
    );
  });

  return {
    analysisOverrides,
    content: {
      ...content,
      collections,
      syntaxSource: input.source,
    },
  };
}
