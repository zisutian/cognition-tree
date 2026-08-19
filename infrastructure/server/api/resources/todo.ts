// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiTodoCollectionDto,
  ApiTodoCollectionsDto,
  ApiTodoItemStateDto,
} from "../../../../contracts/api/types.ts";
import type { ContentRevisionDto } from "../../../../contracts/common/versionedContent.ts";
import {
  createTodoParseIndex,
  type ParsedTodoIndexCollection,
  type TodoParseIndex,
} from "../../../../core/todo/indexes/todoParseIndex.ts";
import {
  todoItemSemanticType,
  type TodoContent,
} from "../../../../core/todo/model/todoContent.ts";
import {
  createTodoCollectionBodyProjection,
} from "../../../../core/todo/model/todoCollectionProjection.ts";
import {
  projectTodoRecurrence,
} from "../../../../core/todo/recurrence/todoRecurrenceProjection.ts";
import type {
  TodoLocalDate,
} from "../../../../core/todo/recurrence/todoLocalDate.ts";
import { projectApiCtnDocument } from "./ctn.ts";
import {
  createParsedTodoCollectionVersion,
  createTodoCollectionStateVersion,
  createTodoItemStateVersion,
  createTodoOrderVersion,
} from "./versions.ts";

export function createApiTodoIndex(content: TodoContent) {
  return createTodoParseIndex(content);
}

function projectTodoItemStates(
  parsed: ParsedTodoIndexCollection,
  today: TodoLocalDate,
): ApiTodoItemStateDto[] {
  const ordinaryCompletionById = new Map(
    parsed.collection.completions.map(({ blockId, completedAt }) => [
      blockId,
      completedAt,
    ]),
  );
  const recurrenceById = new Map(
    parsed.collection.recurrences.map((recurrence) => {
      const projection = projectTodoRecurrence(recurrence, today);

      return [recurrence.blockId, {
        active: projection.active,
        completedAt: projection.active
          ? projection.completedAt
          : ordinaryCompletionById.get(recurrence.blockId) ?? null,
        recurrence: {
          active: projection.active,
          completedCount: projection.completedCount,
          currentOccurrenceDate: projection.currentOccurrenceDate,
          nextOccurrenceDate: projection.nextOccurrenceDate,
          rule: projection.currentStage?.rule ??
            recurrence.stages.at(-1)!.rule,
          totalCount: projection.totalCount,
        },
      }] as const;
    }),
  );

  return parsed.analysis.document.blocks
    .filter(({ rule }) => rule.semanticId === todoItemSemanticType)
    .map((block) => {
      const recurrence = recurrenceById.get(block.id);
      const completedAt = recurrence?.completedAt ??
        ordinaryCompletionById.get(block.id) ??
        null;

      return {
        blockId: block.id,
        completed: completedAt !== null,
        completedAt,
        recurrence: recurrence?.recurrence ?? null,
        stateVersion: createTodoItemStateVersion(
          parsed.collection,
          block.id,
        ),
      };
    });
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
    document: projectApiCtnDocument({
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
    items: projectTodoItemStates(parsed, today),
    stateVersion: createTodoCollectionStateVersion(parsed.collection),
  };
}
