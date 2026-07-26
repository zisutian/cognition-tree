// SPDX-License-Identifier: GPL-3.0-or-later

import {
  getCtnEditableLineNumber,
} from "../../ctn/metadata/editableSource.ts";
import {
  analyzeCtnSource,
  type CtnCanonicalSourceAnalysis,
} from "../../ctn/analysis/sourceAnalysis.ts";
import { isCtnBlockId } from "../../ctn/metadata/blockMetadata.ts";
import {
  readCtnCanonicalTitleHeader,
} from "../../ctn/parser/parseCtnDocument.ts";
import type {
  CtnCanonicalBlock,
} from "../../ctn/parser/types.ts";
import { requireCtnSyntax } from "../../ctn/syntax/compiler.ts";
import type { CtnCompiledSyntax } from "../../ctn/syntax/types.ts";
import {
  compareTodoLocalDates,
  isTodoLocalDate,
  isTodoRecurrenceStageId,
  isTodoRecurrenceStageOccurrence,
  validateTodoRecurrenceRule,
  type TodoRecurrence,
  type TodoRecurrenceCompletion,
  type TodoRecurrenceRule,
  type TodoRecurrenceStage,
  type TodoRecurrenceStageId,
} from "../recurrence/todoRecurrence.ts";

export const todoRepositorySchemaVersion = 4 as const;
export const todoItemSemanticType = "todo-item";

export type TodoCollectionId = `todo-collection-${string}`;

export type TodoCompletion = {
  blockId: string;
  completedAt: string;
};

export type TodoCollection = {
  id: TodoCollectionId;
  source: string;
  completions: TodoCompletion[];
  recurrences: TodoRecurrence[];
};

export type TodoContent = {
  schemaVersion: typeof todoRepositorySchemaVersion;
  syntaxSource: string;
  collections: TodoCollection[];
};

export type TodoCollectionValue = Omit<TodoCollection, "id"> & { id: string };
export type TodoContentValue = Omit<TodoContent, "collections"> & {
  collections: TodoCollectionValue[];
};

export type ParsedTodoCollection = {
  analysis: CtnCanonicalSourceAnalysis;
  collection: TodoCollection;
  name: string;
};

export type ValidatedTodoContentAnalysis = {
  collections: readonly ParsedTodoCollection[];
  content: TodoContent;
  syntax: CtnCompiledSyntax;
};

export type {
  TodoRecurrence,
  TodoRecurrenceCompletion,
  TodoRecurrenceRule,
  TodoRecurrenceStage,
  TodoRecurrenceStageId,
};

const collectionIdPattern =
  /^todo-collection-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class TodoContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TodoContentValidationError";
  }
}

export function isTodoCollectionId(value: string): value is TodoCollectionId {
  return collectionIdPattern.test(value);
}

function readCanonicalTimestamp(value: string, label: string) {
  const milliseconds = Date.parse(value);

  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new TodoContentValidationError(
      `${label} must be a canonical ISO timestamp.`,
    );
  }
  return milliseconds;
}

function validateTodoRecurrence(
  recurrence: TodoRecurrence,
  blockById: ReadonlyMap<string, CtnCanonicalBlock>,
) {
  if (!isCtnBlockId(recurrence.blockId)) {
    throw new TodoContentValidationError(
      `Invalid todo recurrence block id: ${recurrence.blockId}`,
    );
  }
  const block = blockById.get(recurrence.blockId);

  if (!block || block.rule.semanticId !== todoItemSemanticType) {
    throw new TodoContentValidationError(
      `Todo recurrence ${recurrence.blockId} does not identify a todo item.`,
    );
  }
  if (!Array.isArray(recurrence.stages) || recurrence.stages.length === 0) {
    throw new TodoContentValidationError(
      `Todo recurrence ${recurrence.blockId} requires at least one stage.`,
    );
  }
  const stagesById = new Map<TodoRecurrenceStageId, TodoRecurrenceStage>();
  let previous: TodoRecurrenceStage | null = null;

  for (const stage of recurrence.stages) {
    if (!isTodoRecurrenceStageId(stage.id)) {
      throw new TodoContentValidationError(
        `Invalid todo recurrence stage id: ${stage.id}`,
      );
    }
    if (stagesById.has(stage.id)) {
      throw new TodoContentValidationError(
        `Duplicate todo recurrence stage id: ${stage.id}`,
      );
    }
    if (!isTodoLocalDate(stage.startsOn)) {
      throw new TodoContentValidationError(
        `Todo recurrence stage ${stage.id} has an invalid startsOn date.`,
      );
    }
    if (stage.endsBefore !== null && !isTodoLocalDate(stage.endsBefore)) {
      throw new TodoContentValidationError(
        `Todo recurrence stage ${stage.id} has an invalid endsBefore date.`,
      );
    }
    if (
      stage.endsBefore !== null &&
      compareTodoLocalDates(stage.endsBefore, stage.startsOn) <= 0
    ) {
      throw new TodoContentValidationError(
        `Todo recurrence stage ${stage.id} must end after it starts.`,
      );
    }
    if (
      previous &&
      (compareTodoLocalDates(stage.startsOn, previous.startsOn) <= 0 ||
        previous.endsBefore === null ||
        compareTodoLocalDates(previous.endsBefore, stage.startsOn) > 0)
    ) {
      throw new TodoContentValidationError(
        `Todo recurrence stages for ${recurrence.blockId} overlap or are unordered.`,
      );
    }
    try {
      validateTodoRecurrenceRule(stage.rule);
    } catch (error) {
      throw new TodoContentValidationError(
        `Todo recurrence stage ${stage.id} has an invalid rule: ${
          error instanceof Error ? error.message : "unknown rule error"
        }`,
      );
    }
    stagesById.set(stage.id, stage);
    previous = stage;
  }

  const completionKeys = new Set<string>();

  for (const completion of recurrence.completions) {
    const stage = stagesById.get(completion.stageId);

    if (!stage) {
      throw new TodoContentValidationError(
        `Todo recurrence completion references an unknown stage: ${completion.stageId}`,
      );
    }
    if (
      !isTodoLocalDate(completion.occurrenceDate) ||
      !isTodoRecurrenceStageOccurrence(stage, completion.occurrenceDate)
    ) {
      throw new TodoContentValidationError(
        `Todo recurrence completion has an invalid occurrence: ${completion.occurrenceDate}`,
      );
    }
    const key = `${completion.stageId}:${completion.occurrenceDate}`;

    if (completionKeys.has(key)) {
      throw new TodoContentValidationError(
        `Duplicate todo recurrence completion: ${key}`,
      );
    }
    completionKeys.add(key);
    const completedAt = readCanonicalTimestamp(
      completion.completedAt,
      `Todo recurrence completion ${key} completedAt`,
    );

    if (completedAt < Date.parse(block.metadata.createdAt)) {
      throw new TodoContentValidationError(
        `Todo recurrence completion ${key} predates its block.`,
      );
    }
  }
}

export function validateTodoCollectionAnalysis(
  value: TodoCollectionValue,
  syntax: CtnCompiledSyntax,
  analysis: CtnCanonicalSourceAnalysis,
): ParsedTodoCollection {
  if (!isTodoCollectionId(value.id)) {
    throw new TodoContentValidationError(
      `Invalid todo collection id: ${value.id}`,
    );
  }

  let name: string;

  try {
    const header = readCtnCanonicalTitleHeader(value.source);

    name = header.title;
    if (
      analysis.sourceText.source !== value.source ||
      analysis.syntax.analysisKey !== syntax.analysisKey
    ) {
      throw new Error("Prepared Todo analysis does not match its collection.");
    }
  } catch (error) {
    throw new TodoContentValidationError(
      `Todo collection ${value.id} has invalid canonical CTN source: ${
        error instanceof Error ? error.message : "unknown CTN error"
      }`,
    );
  }

  const blockById = new Map(
    analysis.document.blocks.map((block) => [block.id, block]),
  );
  const completionIds = new Set<string>();

  for (const completion of value.completions) {
    if (!isCtnBlockId(completion.blockId)) {
      throw new TodoContentValidationError(
        `Invalid todo completion block id: ${completion.blockId}`,
      );
    }
    if (completionIds.has(completion.blockId)) {
      throw new TodoContentValidationError(
        `Duplicate todo completion block id: ${completion.blockId}`,
      );
    }
    completionIds.add(completion.blockId);
    const block = blockById.get(completion.blockId);

    if (!block || block.rule.semanticId !== todoItemSemanticType) {
      throw new TodoContentValidationError(
        `Todo completion ${completion.blockId} does not identify a todo item.`,
      );
    }
    const completedAt = readCanonicalTimestamp(
      completion.completedAt,
      `Todo completion ${completion.blockId} completedAt`,
    );

    if (completedAt < Date.parse(block.metadata.createdAt)) {
      throw new TodoContentValidationError(
        `Todo completion ${completion.blockId} predates its block.`,
      );
    }
  }

  const recurrenceIds = new Set<string>();

  for (const recurrence of value.recurrences) {
    if (recurrenceIds.has(recurrence.blockId)) {
      throw new TodoContentValidationError(
        `Duplicate todo recurrence block id: ${recurrence.blockId}`,
      );
    }
    recurrenceIds.add(recurrence.blockId);
    validateTodoRecurrence(recurrence, blockById);
  }

  return {
    analysis,
    collection: value as TodoCollection,
    name,
  };
}

export function validateTodoContentAnalysis(
  content: TodoContentValue,
  {
    analysisByCollectionId = new Map(),
    syntax: preparedSyntax,
  }: {
    analysisByCollectionId?: ReadonlyMap<
      TodoCollectionId,
      CtnCanonicalSourceAnalysis
    >;
    syntax?: CtnCompiledSyntax;
  } = {},
): ValidatedTodoContentAnalysis {
  if (content.schemaVersion !== todoRepositorySchemaVersion) {
    throw new TodoContentValidationError(
      `Todo schema version must be ${todoRepositorySchemaVersion}.`,
    );
  }

  let syntax: CtnCompiledSyntax;

  try {
    syntax = preparedSyntax ??
      requireCtnSyntax(content.syntaxSource, "todo");
    if (syntax.owner !== "todo") {
      throw new Error("Prepared syntax is not owned by Todo.");
    }
  } catch (error) {
    throw new TodoContentValidationError(
      `Todo syntax is invalid: ${
        error instanceof Error ? error.message : "unknown syntax error"
      }`,
    );
  }

  const collectionIds = new Set<TodoCollectionId>();
  const blockOwners = new Map<string, TodoCollectionId>();
  const collections: ParsedTodoCollection[] = [];

  for (const collection of content.collections) {
    let analysis = analysisByCollectionId.get(
      collection.id as TodoCollectionId,
    );

    if (!analysis) {
      try {
        analysis = analyzeCtnSource({
          mode: { kind: "canonical-document" },
          source: collection.source,
          syntax,
        });
      } catch (error) {
        throw new TodoContentValidationError(
          `Todo collection ${collection.id} has invalid canonical CTN source: ${
            error instanceof Error ? error.message : "unknown CTN error"
          }`,
        );
      }
    }
    const parsed = validateTodoCollectionAnalysis(
      collection,
      syntax,
      analysis,
    );

    if (collectionIds.has(parsed.collection.id)) {
      throw new TodoContentValidationError(
        `Duplicate todo collection id: ${parsed.collection.id}`,
      );
    }
    collectionIds.add(parsed.collection.id);

    for (const block of parsed.analysis.document.blocks) {
      const owner = blockOwners.get(block.id);

      if (owner) {
        throw new TodoContentValidationError(
          `Todo block id ${block.id} is shared by ${owner} and ${collection.id}.`,
        );
      }
      blockOwners.set(block.id, parsed.collection.id);
    }
    collections.push(parsed);
  }

  return {
    collections,
    content: content as TodoContent,
    syntax,
  };
}

export function validateTodoContent(
  content: TodoContentValue,
  options: Parameters<typeof validateTodoContentAnalysis>[1] = {},
): TodoContent {
  return validateTodoContentAnalysis(content, options).content;
}

type LocatedBlock = {
  block: CtnCanonicalBlock;
  collectionId: TodoCollectionId;
};

function collectLocatedBlocks(
  collections: readonly ParsedTodoCollection[],
) {
  const blocks = new Map<string, LocatedBlock>();

  for (const parsed of collections) {
    for (const block of parsed.analysis.document.blocks) {
      blocks.set(block.id, {
        block,
        collectionId: parsed.collection.id,
      });
    }
  }
  return blocks;
}

export function validateTodoContentTransition(
  previousValue: TodoContentValue,
  nextValue: TodoContentValue,
): TodoContent {
  const previousResult = validateTodoContentAnalysis(previousValue);
  const nextResult = validateTodoContentAnalysis(nextValue);
  const previous = previousResult.content;
  const next = nextResult.content;
  const previousCollections = new Map(
    previous.collections.map((collection) => [collection.id, collection]),
  );
  const previousBlocks = collectLocatedBlocks(previousResult.collections);
  const nextBlocks = collectLocatedBlocks(nextResult.collections);

  for (const nextCollection of next.collections) {
    const previousCollection = previousCollections.get(nextCollection.id);

    if (!previousCollection) continue;
    const previousTitle = readCtnCanonicalTitleHeader(previousCollection.source);
    const nextTitle = readCtnCanonicalTitleHeader(nextCollection.source);

    if (previousTitle.metadata.id !== nextTitle.metadata.id) {
      throw new TodoContentValidationError(
        `Todo collection ${nextCollection.id} title block id is immutable.`,
      );
    }
    if (previousTitle.metadata.createdAt !== nextTitle.metadata.createdAt) {
      throw new TodoContentValidationError(
        `Todo collection ${nextCollection.id} createdAt is immutable.`,
      );
    }
  }

  for (const [blockId, previousLocation] of previousBlocks) {
    const nextLocation = nextBlocks.get(blockId);

    if (!nextLocation) continue;
    if (previousLocation.collectionId !== nextLocation.collectionId) {
      throw new TodoContentValidationError(
        `Todo block ${blockId} cannot move to another collection.`,
      );
    }
    if (
      previousLocation.block.metadata.createdAt !==
        nextLocation.block.metadata.createdAt
    ) {
      throw new TodoContentValidationError(
        `Todo block ${blockId} createdAt is immutable.`,
      );
    }
    if (
      Date.parse(nextLocation.block.metadata.updatedAt) <
        Date.parse(previousLocation.block.metadata.updatedAt)
    ) {
      throw new TodoContentValidationError(
        `Todo block ${blockId} updatedAt cannot move backwards.`,
      );
    }
  }

  return next;
}

export function createTodoCollectionBodyProjection(
  parsed: ParsedTodoCollection,
) {
  const editable = parsed.analysis.editableProjection;
  const prefix = `${parsed.name}\n`;
  const source = editable.source === parsed.name
    ? ""
    : editable.source.startsWith(prefix)
      ? editable.source.slice(prefix.length)
      : (() => {
          throw new TodoContentValidationError(
            `Todo collection ${parsed.collection.id} has an invalid editable title.`,
          );
        })();

  return {
    analysis: parsed.analysis,
    editableSource: editable.source,
    name: parsed.name,
    source,
    projectCanonicalLineNumber(canonicalLineNumber: number) {
      return Math.max(
        1,
        getCtnEditableLineNumber(editable, canonicalLineNumber) - 1,
      );
    },
  };
}
