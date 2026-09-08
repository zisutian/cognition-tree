// SPDX-License-Identifier: GPL-3.0-or-later

import { projectTodoItemStates } from "../../../../application/todo/index.ts";

import type {
  ApiTodoCollectionDto,
  ApiTodoCollectionsDto,
} from "../../../../contracts/api/index.ts";
import type { ContentRevisionDto } from "../../../../contracts/common/index.ts";
import {
  createTodoParseIndex,
  type ParsedTodoIndexCollection,
  type TodoParseIndex,
  type TodoContent,
  createTodoCollectionBodyProjection,
} from "../../../../core/todo/index.ts";



import type {
  TodoLocalDate,
} from "../../../../core/todo/index.ts";
import { projectContentDocument } from "../../../../application/commands/index.ts";
import {
  createParsedTodoCollectionVersion,
  createTodoCollectionStateVersion,
  createTodoItemStateVersion,
  createTodoOrderVersion,
} from "./versions.ts";

export function createApiTodoIndex(content: TodoContent) {
  return createTodoParseIndex(content);
}

export function projectApiTodoCollections(
  content: TodoContent,
  index: TodoParseIndex,
  revision: ContentRevisionDto,
): ApiTodoCollectionsDto {
  return {
    collections: index.collections.map(({ collection, name }) => ({
      id: collection.id,
      name,
      stateVersion: createTodoCollectionStateVersion(collection),
      version: createParsedTodoCollectionVersion(
        index.getParsedCollection(collection.id)!,
      ),
    })),
    orderVersion: createTodoOrderVersion(content),
    revision,
  };
}
export function projectApiTodoCollection(
  parsed: ParsedTodoIndexCollection,
  today: TodoLocalDate,
): ApiTodoCollectionDto {
  const body = createTodoCollectionBodyProjection(parsed);

  return {
    document: projectContentDocument({
      analysis: parsed.analysis,
      createdAt: parsed.analysis.document.blocks[0]!.metadata.createdAt,
      editableText: body.source,
      resourceId: parsed.collection.id,
      textMode: "body",
      title: parsed.name,
      updatedAt: parsed.analysis.document.blocks.reduce(
        (latest, block) =>
          Date.parse(block.metadata.updatedAt) > Date.parse(latest)
            ? block.metadata.updatedAt
            : latest,
        parsed.analysis.document.blocks[0]!.metadata.updatedAt,
      ),
      version: createParsedTodoCollectionVersion(parsed),
    }),
    items: projectTodoItemStates(parsed, today, createTodoItemStateVersion),
    stateVersion: createTodoCollectionStateVersion(parsed.collection),
  };
}
