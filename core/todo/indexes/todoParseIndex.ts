// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnCanonicalSourceAnalysis,
} from "../../ctn/analysis/sourceAnalysis.ts";
import {
  analyzeCtnSource,
  reprojectCtnAnalysisPresentation,
} from "../../ctn/analysis/sourceAnalysis.ts";
import {
  createCtnBlockIdRegistry,
  updateCtnBlockIdRegistry,
  type CtnBlockIdRegistry,
  type CtnBlockIdRegistryChange,
} from "../../ctn/analysis/blockIdRegistry.ts";
import { requireCtnSyntax } from "../../ctn/syntax/compiler.ts";
import type { CtnCompiledSyntax } from "../../ctn/syntax/types.ts";
import {
  validateTodoContentAnalysis,
  type ValidatedTodoContentAnalysis,
  type TodoCollection,
  type TodoCollectionId,
  type TodoContent,
} from "../model/todoContent.ts";

export type ParsedTodoIndexCollection = {
  analysis: CtnCanonicalSourceAnalysis;
  collection: TodoCollection;
  name: string;
};

export type TodoParseCacheEntry = {
  analysis: CtnCanonicalSourceAnalysis;
  analysisKey: string;
  name: string;
  source: string;
};

export type TodoParseIndex = {
  analysisStats: {
    analyzedCollectionIds: readonly TodoCollectionId[];
    runCount: number;
    updatedBlockIdOwnerIds: readonly TodoCollectionId[];
  };
  blockIdRegistry: CtnBlockIdRegistry<TodoCollectionId>;
  blockIds: ReadonlySet<string>;
  collections: readonly ParsedTodoIndexCollection[];
  collectionById: ReadonlyMap<TodoCollectionId, ParsedTodoIndexCollection>;
  getParsedCollection(
    collectionId: TodoCollectionId,
  ): ParsedTodoIndexCollection | null;
  parseCache: ReadonlyMap<TodoCollectionId, TodoParseCacheEntry>;
  latestTimestamp: string | null;
  syntax: CtnCompiledSyntax;
  syntaxSource: string;
  validation: ValidatedTodoContentAnalysis;
};

export function createTodoParseIndex(
  content: TodoContent,
  previousIndex?: TodoParseIndex | null,
  analysisOverrides?: ReadonlyMap<
    TodoCollectionId,
    CtnCanonicalSourceAnalysis
  >,
): TodoParseIndex {
  const syntax = previousIndex?.syntaxSource === content.syntaxSource
    ? previousIndex.syntax
    : requireCtnSyntax(content.syntaxSource, "todo");
  const parseCache = new Map<TodoCollectionId, TodoParseCacheEntry>();
  const analyzedCollectionIds: TodoCollectionId[] = [];
  const analysisByCollectionId = new Map(
    content.collections.map(
      (collection): [TodoCollectionId, CtnCanonicalSourceAnalysis] => {
        const cached = previousIndex?.parseCache.get(collection.id);
        const override = analysisOverrides?.get(collection.id);
        let analysis: CtnCanonicalSourceAnalysis;

        if (
          override?.sourceText.source === collection.source &&
          override.syntax.analysisKey === syntax.analysisKey
        ) {
          analysis = override.syntax.presentationKey === syntax.presentationKey
            ? override
            : reprojectCtnAnalysisPresentation(override, syntax);
        } else if (
          cached?.source === collection.source &&
          cached.analysisKey === syntax.analysisKey
        ) {
          analysis = cached.analysis.syntax.presentationKey ===
              syntax.presentationKey
            ? cached.analysis
            : reprojectCtnAnalysisPresentation(cached.analysis, syntax);
        } else {
          analyzedCollectionIds.push(collection.id);
          analysis = analyzeCtnSource({
            mode: { kind: "canonical-document" },
            source: collection.source,
            syntax,
          });
        }

        return [collection.id, analysis];
      },
    ),
  );
  const validated = validateTodoContentAnalysis(content, {
    analysisByCollectionId,
    syntax,
  });
  const collections: readonly ParsedTodoIndexCollection[] =
    validated.collections;

  for (const { analysis, collection, name } of collections) {
    parseCache.set(collection.id, {
      analysis,
      analysisKey: syntax.analysisKey,
      name,
      source: collection.source,
    });
  }
  const collectionById = new Map(
    collections.map((parsed) => [parsed.collection.id, parsed]),
  );

  const canUpdateBlockIdRegistry =
    previousIndex?.syntax.blockGrammarKey === syntax.blockGrammarKey;
  const updatedBlockIdOwnerIds: TodoCollectionId[] = [];
  let blockIdRegistry: CtnBlockIdRegistry<TodoCollectionId>;

  if (previousIndex && canUpdateBlockIdRegistry) {
    const currentCollectionIds = new Set(
      collections.map(({ collection }) => collection.id),
    );
    const changes: CtnBlockIdRegistryChange<TodoCollectionId>[] = [];

    for (
      const ownerId of previousIndex.blockIdRegistry.blockIdsByOwner.keys()
    ) {
      if (!currentCollectionIds.has(ownerId)) {
        changes.push({ entry: null, ownerId });
        updatedBlockIdOwnerIds.push(ownerId);
      }
    }
    for (const parsed of collections) {
      const previousCacheEntry = previousIndex.parseCache.get(
        parsed.collection.id,
      );

      if (
        !previousCacheEntry ||
        previousCacheEntry.source !== parsed.collection.source
      ) {
        changes.push({
          entry: {
            analysis: parsed.analysis,
            ownerId: parsed.collection.id,
          },
          ownerId: parsed.collection.id,
        });
        updatedBlockIdOwnerIds.push(parsed.collection.id);
      }
    }
    blockIdRegistry = updateCtnBlockIdRegistry(
      previousIndex.blockIdRegistry,
      changes,
    );
  } else {
    updatedBlockIdOwnerIds.push(
      ...collections.map(({ collection }) => collection.id),
    );
    blockIdRegistry = createCtnBlockIdRegistry(
      collections.map(({ analysis, collection }) => ({
        analysis,
        ownerId: collection.id,
      })),
    );
  }
  let latestTimestamp: string | null = null;
  const includeTimestamp = (timestamp: string) => {
    if (
      latestTimestamp === null ||
      Date.parse(timestamp) > Date.parse(latestTimestamp)
    ) {
      latestTimestamp = timestamp;
    }
  };

  for (const { analysis, collection } of collections) {
    analysis.document.blocks.forEach((block) =>
      includeTimestamp(block.metadata.updatedAt)
    );
    collection.completions.forEach((completion) =>
      includeTimestamp(completion.completedAt)
    );
    collection.recurrences.forEach((recurrence) =>
      recurrence.completions.forEach((completion) =>
        includeTimestamp(completion.completedAt)
      )
    );
  }

  return {
    analysisStats: {
      analyzedCollectionIds,
      runCount: analyzedCollectionIds.length,
      updatedBlockIdOwnerIds,
    },
    blockIdRegistry,
    blockIds: blockIdRegistry.blockIds,
    collectionById,
    collections,
    getParsedCollection(collectionId) {
      return collectionById.get(collectionId) ?? null;
    },
    latestTimestamp,
    parseCache,
    syntax,
    syntaxSource: content.syntaxSource,
    validation: validated,
  };
}
