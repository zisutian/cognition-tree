// SPDX-License-Identifier: GPL-3.0-or-later

import { parseCtnCanonicalDocument } from "../../ctn/parser/parseCtnDocument.ts";
import type { CtnCanonicalDocument } from "../../ctn/parser/types.ts";
import {
  parseTodoCollection,
  type TodoCollection,
  type TodoCollectionId,
  type TodoContent,
} from "../model/todoContent.ts";
import { requireTodoSyntaxProfile } from "../syntax/todoSyntax.ts";

export type ParsedTodoIndexCollection = {
  collection: TodoCollection;
  document: CtnCanonicalDocument;
  name: string;
};

export type TodoParseCacheEntry = {
  document: CtnCanonicalDocument;
  source: string;
  syntaxSource: string;
};

export type TodoParseIndex = {
  collections: readonly ParsedTodoIndexCollection[];
  collectionById: ReadonlyMap<TodoCollectionId, ParsedTodoIndexCollection>;
  getParsedCollection(
    collectionId: TodoCollectionId,
  ): ParsedTodoIndexCollection | null;
  parseCache: ReadonlyMap<TodoCollectionId, TodoParseCacheEntry>;
  syntaxProfile: ReturnType<typeof requireTodoSyntaxProfile>;
};

export function createTodoParseIndex(
  content: TodoContent,
  previousIndex?: TodoParseIndex | null,
): TodoParseIndex {
  const syntaxProfile = requireTodoSyntaxProfile(content.syntaxSource);
  const parseCache = new Map<TodoCollectionId, TodoParseCacheEntry>();
  const collections = content.collections.map(
    (collection): ParsedTodoIndexCollection => {
      const cached = previousIndex?.parseCache.get(collection.id);
      const document = cached?.source === collection.source &&
          cached.syntaxSource === content.syntaxSource
        ? cached.document
        : parseCtnCanonicalDocument(collection.source, syntaxProfile);
      const name = parseTodoCollection(collection, syntaxProfile).name;

      parseCache.set(collection.id, {
        document,
        source: collection.source,
        syntaxSource: content.syntaxSource,
      });
      return { collection, document, name };
    },
  );
  const collectionById = new Map(
    collections.map((parsed) => [parsed.collection.id, parsed]),
  );

  return {
    collectionById,
    collections,
    getParsedCollection(collectionId) {
      return collectionById.get(collectionId) ?? null;
    },
    parseCache,
    syntaxProfile,
  };
}
