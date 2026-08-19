// SPDX-License-Identifier: GPL-3.0-or-later

import {
  recanonicalizeCtnSourceBlockMetadata,
  reconcileCtnSourceBlockMetadata,
} from "../../ctn/metadata/reconcileSourceMetadata.ts";
import { createCtnBlockIdAllocator } from "../../ctn/metadata/blockIdAllocator.ts";
import {
  initializeCtnSourceBlockMetadataAnalysis,
  replaceCtnSourceTitle,
  touchCtnSourceBlockMetadata,
} from "../../ctn/metadata/sourceMetadata.ts";
import {
  assertCtnEditableSourceChange,
  type CtnEditableSourceChange,
} from "../../ctn/metadata/textEdits.ts";
import { analyzeCtnSource } from "../../ctn/analysis/sourceAnalysis.ts";
import {
  moveCtnBlockWithinText,
  type CtnBlockTextTargetPosition,
} from "../../ctn/parser/blockTextEdit.ts";
import {
  readCtnCanonicalTitleHeader,
} from "../../ctn/parser/parseCtnDocument.ts";
import type { CtnCanonicalBlock } from "../../ctn/parser/types.ts";
import type {
  CtnCanonicalSourceAnalysis,
} from "../../ctn/analysis/sourceAnalysis.ts";
import { requireCtnSyntax } from "../../ctn/syntax/compiler.ts";
import {
  createPortableNameKey,
  parsePortableName,
} from "../../naming/portableName.ts";
import {
  todoItemSemanticType,
  type TodoCollection,
  type TodoCollectionId,
  type TodoContent,
} from "../model/todoContent.ts";
import { isTodoCollectionId } from "../model/todoIdentity.ts";
import type {
  TodoParseIndex,
} from "../indexes/todoParseIndex.ts";
import {
  addTodoLocalDays,
  requireTodoLocalDate,
  type TodoLocalDate,
} from "../recurrence/todoLocalDate.ts";
import {
  isTodoRecurrenceStageId,
  type TodoRecurrence,
  type TodoRecurrenceStageId,
} from "../recurrence/todoRecurrenceSchedule.ts";
import {
  validateTodoRecurrenceRule,
  type TodoRecurrenceRule,
} from "../recurrence/todoRecurrenceRule.ts";
import {
  projectTodoRecurrence,
} from "../recurrence/todoRecurrenceProjection.ts";
import {
  DomainNotFoundError,
  DomainValidationError,
} from "../../errors/domainErrors.ts";

export type CreateTodoCollectionInput = {
  collectionId: TodoCollectionId;
  createBlockId: () => string;
  createdAt: string;
  name: string;
};

export type RenameTodoCollectionInput = {
  collectionId: TodoCollectionId;
  name: string;
  updatedAt: string;
};

export type MoveTodoCollectionInput = {
  collectionId: TodoCollectionId;
  toIndex: number;
};

export type UpdateTodoCollectionBodyInput = {
  change: CtnEditableSourceChange;
  collectionId: TodoCollectionId;
  createBlockId: () => string;
  updatedAt: string;
};

export type ToggleTodoBlockInput = {
  blockId: string;
  collectionId: TodoCollectionId;
  completedAt: string;
  today: TodoLocalDate;
};

export type SetTodoBlockCompletionInput = ToggleTodoBlockInput & {
  completed: boolean;
  occurrenceDate: TodoLocalDate | null;
};

export type SetTodoBlockRecurrenceInput = {
  blockId: string;
  collectionId: TodoCollectionId;
  rule: TodoRecurrenceRule;
  stageId: TodoRecurrenceStageId;
  today: TodoLocalDate;
  updatedAt: string;
};

export type StopTodoBlockRecurrenceInput = {
  blockId: string;
  collectionId: TodoCollectionId;
  today: TodoLocalDate;
  updatedAt: string;
};

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

export type UpdateTodoSyntaxSourceInput = {
  createBlockId: () => string;
  source: string;
  updatedAt: string;
};

function canonicalTimestamp(value: string, label: string) {
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

function findCollectionIndex(
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

function replaceCollection(
  content: TodoContent,
  collectionIndex: number,
  collection: TodoCollection,
) {
  const collections = [...content.collections];

  collections[collectionIndex] = collection;
  return { ...content, collections };
}

function assertTargetIndex(toIndex: number, length: number, label: string) {
  if (!Number.isSafeInteger(toIndex) || toIndex < 0 || toIndex >= length) {
    throw new DomainValidationError(
      `${label} target index is out of bounds: ${toIndex}`,
    );
  }
}

function moveAt<T>(values: readonly T[], fromIndex: number, toIndex: number) {
  const next = [...values];
  const [value] = next.splice(fromIndex, 1);

  next.splice(toIndex, 0, value as T);
  return next;
}

function cleanTodoSidecars(
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

function assertCollectionNameAvailable(
  index: TodoParseIndex,
  name: string,
  exceptCollectionId?: TodoCollectionId,
) {
  const key = createPortableNameKey(name);
  const conflict = index.collections.find(({ collection, name }) =>
    collection.id !== exceptCollectionId &&
    createPortableNameKey(name) ===
      key
  );

  if (conflict) {
    throw new DomainValidationError(
      `Todo collection name already exists: ${name}`,
    );
  }
}

export function createTodoCollection(
  content: TodoContent,
  index: TodoParseIndex,
  input: CreateTodoCollectionInput,
) {
  if (!isTodoCollectionId(input.collectionId)) {
    throw new DomainValidationError(
      `Invalid todo collection id: ${input.collectionId}`,
    );
  }
  if (content.collections.some(({ id }) => id === input.collectionId)) {
    throw new DomainValidationError(
      `Todo collection already exists: ${input.collectionId}`,
    );
  }
  canonicalTimestamp(input.createdAt, "Todo collection createdAt");
  const name = parsePortableName(input.name, "Todo collection name");
  assertCollectionNameAvailable(index, name);
  const initialized = initializeCtnSourceBlockMetadataAnalysis(
    name,
    index.syntax,
    {
    createId: input.createBlockId,
    createdAt: input.createdAt,
    reservedIds: index.blockIds,
    updatedAt: input.createdAt,
    },
  );
  const source = initialized.source;
  const next: TodoContent = {
    ...content,
    collections: [
      ...content.collections,
      { completions: [], id: input.collectionId, recurrences: [], source },
    ],
  };

  return {
    analysis: initialized.analysis,
    collectionId: input.collectionId,
    content: next,
  };
}

export function renameTodoCollection(
  content: TodoContent,
  index: TodoParseIndex,
  input: RenameTodoCollectionInput,
) {
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const name = parsePortableName(input.name, "Todo collection name");
  const current = readCtnCanonicalTitleHeader(collection.source);

  if (current.title === name) return content;
  assertCollectionNameAvailable(index, name, input.collectionId);
  canonicalTimestamp(input.updatedAt, "Todo collection updatedAt");
  if (Date.parse(input.updatedAt) < Date.parse(current.metadata.updatedAt)) {
    throw new DomainValidationError(
      "Todo collection updatedAt cannot move backwards.",
    );
  }

  return replaceCollection(content, collectionIndex, {
    ...collection,
    source: replaceCtnSourceTitle(collection.source, name, input.updatedAt),
  });
}

export function deleteTodoCollection(
  content: TodoContent,
  collectionId: TodoCollectionId,
) {
  const collectionIndex = findCollectionIndex(content, collectionId);
  const collections = [...content.collections];

  collections.splice(collectionIndex, 1);
  return { ...content, collections };
}

export function moveTodoCollection(
  content: TodoContent,
  input: MoveTodoCollectionInput,
) {
  const collectionIndex = findCollectionIndex(content, input.collectionId);

  assertTargetIndex(input.toIndex, content.collections.length, "Todo collection");
  if (collectionIndex === input.toIndex) return content;
  return {
    ...content,
    collections: moveAt(content.collections, collectionIndex, input.toIndex),
  };
}

export function updateTodoCollectionBody(
  content: TodoContent,
  index: TodoParseIndex,
  input: UpdateTodoCollectionBodyInput,
) {
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const parsed = index.getParsedCollection(input.collectionId);

  if (!parsed || parsed.collection.source !== collection.source) {
    throw new Error(
      `Todo collection analysis is stale: ${input.collectionId}`,
    );
  }
  const syntax = index.syntax;
  const editableSource = parsed.analysis.editableProjection.source;
  const prefix = `${parsed.name}\n`;
  const bodySource = editableSource === parsed.name
    ? ""
    : editableSource.startsWith(prefix)
      ? editableSource.slice(prefix.length)
      : (() => {
          throw new Error(
            `Todo collection ${input.collectionId} has an invalid editable title.`,
          );
        })();
  const current = {
    analysis: parsed.analysis,
    editableSource,
    name: parsed.name,
    source: bodySource,
  };

  assertCtnEditableSourceChange(current.source, input.change);
  if (current.source === input.change.source) {
    return { analysis: current.analysis, content };
  }
  canonicalTimestamp(input.updatedAt, "Todo collection updatedAt");
  const titleMetadata = readCtnCanonicalTitleHeader(collection.source).metadata;

  if (Date.parse(input.updatedAt) < Date.parse(titleMetadata.updatedAt)) {
    throw new DomainValidationError(
      "Todo collection updatedAt cannot move backwards.",
    );
  }

  const nextEditableSource = `${current.name}\n${input.change.source}`;
  const titleSeparatorOffset = current.name.length + 1;
  const edits = current.editableSource === current.name
    ? [{
        from: current.name.length,
        insertedText: `\n${input.change.source}`,
        to: current.name.length,
      }]
    : input.change.edits.map((edit) => ({
        ...edit,
        from: edit.from + titleSeparatorOffset,
        to: edit.to + titleSeparatorOffset,
      }));
  const reconciled = reconcileCtnSourceBlockMetadata(
    current.analysis,
    analyzeCtnSource({
      mode: { kind: "editable-document" },
      source: nextEditableSource,
      syntax,
    }),
    { edits, source: nextEditableSource },
    {
      createId: input.createBlockId,
      reservedIds: index.blockIds,
      timestamp: input.updatedAt,
      touchTitle: false,
    },
  );
  const withSource = cleanTodoSidecars(
    { ...collection, source: reconciled.source },
    reconciled.analysis,
  );

  return {
    analysis: reconciled.analysis,
    content: replaceCollection(content, collectionIndex, withSource),
  };
}

function requireTodoItemBlock(
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

function replaceTodoCollectionWithTouchedBlock(
  content: TodoContent,
  collectionIndex: number,
  collection: TodoCollection,
  block: CtnCanonicalBlock,
  updatedAt: string,
) {
  canonicalTimestamp(updatedAt, "Todo block updatedAt");
  return replaceCollection(content, collectionIndex, {
    ...collection,
    source: touchCtnSourceBlockMetadata(
      collection.source,
      block,
      updatedAt,
    ),
  });
}

export function toggleTodoBlock(
  content: TodoContent,
  index: TodoParseIndex,
  input: ToggleTodoBlockInput,
) {
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const recurrence = collection.recurrences.find(
    ({ blockId }) => blockId === input.blockId,
  );
  const recurrenceProjection = recurrence
    ? projectTodoRecurrence(recurrence, requireTodoLocalDate(input.today))
    : null;
  const completed = recurrenceProjection?.active
    ? recurrenceProjection.completed
    : collection.completions.some(({ blockId }) => blockId === input.blockId);

  return setTodoBlockCompletion(content, index, {
    ...input,
    completed: !completed,
    occurrenceDate: recurrenceProjection?.active
      ? recurrenceProjection.currentOccurrenceDate
      : null,
  });
}

export class TodoOccurrenceConflictError extends Error {
  readonly currentOccurrenceDate: TodoLocalDate | null;

  constructor(currentOccurrenceDate: TodoLocalDate | null) {
    super("Todo recurrence occurrence is no longer current.");
    this.name = "TodoOccurrenceConflictError";
    this.currentOccurrenceDate = currentOccurrenceDate;
  }
}

export function setTodoBlockCompletion(
  content: TodoContent,
  index: TodoParseIndex,
  input: SetTodoBlockCompletionInput,
) {
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const block = requireTodoItemBlock(
    index,
    input.collectionId,
    input.blockId,
  );
  const today = requireTodoLocalDate(input.today);
  const recurrenceIndex = collection.recurrences.findIndex(
    ({ blockId }) => blockId === input.blockId,
  );
  const recurrence = recurrenceIndex >= 0
    ? collection.recurrences[recurrenceIndex]
    : null;
  const recurrenceProjection = recurrence
    ? projectTodoRecurrence(recurrence, today)
    : null;

  if (recurrence && recurrenceProjection?.active) {
    if (
      input.occurrenceDate === null ||
      input.occurrenceDate !== recurrenceProjection.currentOccurrenceDate ||
      !recurrenceProjection.currentStage
    ) {
      throw new TodoOccurrenceConflictError(
        recurrenceProjection.currentOccurrenceDate,
      );
    }
    if (input.completed === recurrenceProjection.completed) return content;
    const completions = [...recurrence.completions];
    const completionIndex = completions.findIndex((completion) =>
      completion.stageId === recurrenceProjection.currentStage!.id &&
      completion.occurrenceDate === input.occurrenceDate
    );

    if (input.completed) {
      const completedAt = canonicalTimestamp(
        input.completedAt,
        "Todo recurrence completion completedAt",
      );

      if (completedAt < Date.parse(block.metadata.createdAt)) {
        throw new DomainValidationError(
          "Todo completion cannot predate its block.",
        );
      }
      completions.push({
        completedAt: input.completedAt,
        occurrenceDate: input.occurrenceDate,
        stageId: recurrenceProjection.currentStage.id,
      });
    } else if (completionIndex >= 0) {
      completions.splice(completionIndex, 1);
    }
    const recurrences = [...collection.recurrences];

    recurrences[recurrenceIndex] = { ...recurrence, completions };
    return replaceTodoCollectionWithTouchedBlock(
      content,
      collectionIndex,
      { ...collection, recurrences },
      block,
      input.completedAt,
    );
  }
  if (input.occurrenceDate !== null) {
    throw new TodoOccurrenceConflictError(null);
  }
  const existingIndex = collection.completions.findIndex(
    ({ blockId }) => blockId === input.blockId,
  );
  const completions = [...collection.completions];

  if (!input.completed && existingIndex >= 0) {
    completions.splice(existingIndex, 1);
  } else if (input.completed && existingIndex < 0) {
    const completedAt = canonicalTimestamp(
      input.completedAt,
      "Todo completion completedAt",
    );

    if (completedAt < Date.parse(block.metadata.createdAt)) {
      throw new DomainValidationError(
        "Todo completion cannot predate its block.",
      );
    }
    completions.push({ blockId: input.blockId, completedAt: input.completedAt });
  } else {
    return content;
  }

  return replaceTodoCollectionWithTouchedBlock(
    content,
    collectionIndex,
    { ...collection, completions },
    block,
    input.completedAt,
  );
}

function assertNewRecurrenceStageId(
  collection: TodoCollection,
  stageId: TodoRecurrenceStageId,
) {
  if (!isTodoRecurrenceStageId(stageId)) {
    throw new DomainValidationError(
      `Invalid Todo recurrence stage id: ${stageId}`,
    );
  }
  if (
    collection.recurrences.some(({ stages }) =>
      stages.some(({ id }) => id === stageId)
    )
  ) {
    throw new DomainValidationError(
      `Todo recurrence stage already exists: ${stageId}`,
    );
  }
}

function rulesEqual(left: TodoRecurrenceRule, right: TodoRecurrenceRule) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function setTodoBlockRecurrence(
  content: TodoContent,
  index: TodoParseIndex,
  input: SetTodoBlockRecurrenceInput,
) {
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const block = requireTodoItemBlock(
    index,
    input.collectionId,
    input.blockId,
  );
  const today = requireTodoLocalDate(input.today);
  validateTodoRecurrenceRule(input.rule);
  const recurrenceIndex = collection.recurrences.findIndex(
    ({ blockId }) => blockId === input.blockId,
  );
  const recurrence = recurrenceIndex >= 0
    ? collection.recurrences[recurrenceIndex]
    : null;
  const ordinaryCompletion = collection.completions.find(
    ({ blockId }) => blockId === input.blockId,
  ) ?? null;
  let nextRecurrence: TodoRecurrence;

  if (!recurrence) {
    assertNewRecurrenceStageId(collection, input.stageId);
    nextRecurrence = {
      blockId: input.blockId,
      completions: ordinaryCompletion
        ? [{
            completedAt: ordinaryCompletion.completedAt,
            occurrenceDate: today,
            stageId: input.stageId,
          }]
        : [],
      stages: [{
        endsBefore: null,
        id: input.stageId,
        rule: input.rule,
        startsOn: today,
      }],
    };
  } else {
    const projection = projectTodoRecurrence(recurrence, today);
    const lastStage = recurrence.stages.at(-1)!;

    if (projection.active) {
      if (
        lastStage.startsOn !== today &&
        lastStage.startsOn === addTodoLocalDays(today, 1)
      ) {
        if (rulesEqual(lastStage.rule, input.rule)) return content;
        nextRecurrence = {
          ...recurrence,
          stages: [
            ...recurrence.stages.slice(0, -1),
            { ...lastStage, rule: input.rule },
          ],
        };
      } else {
        if (
          projection.currentStage &&
          rulesEqual(projection.currentStage.rule, input.rule)
        ) {
          return content;
        }
        assertNewRecurrenceStageId(collection, input.stageId);
        const startsOn = addTodoLocalDays(today, 1);

        nextRecurrence = {
          ...recurrence,
          stages: [
            ...recurrence.stages.map((stage) =>
              stage.id === projection.currentStage?.id
                ? { ...stage, endsBefore: startsOn }
                : stage
            ),
            {
              endsBefore: null,
              id: input.stageId,
              rule: input.rule,
              startsOn,
            },
          ],
        };
      }
    } else {
      assertNewRecurrenceStageId(collection, input.stageId);
      nextRecurrence = {
        ...recurrence,
        completions: [
          ...recurrence.completions,
          ...(ordinaryCompletion
            ? [{
                completedAt: ordinaryCompletion.completedAt,
                occurrenceDate: today,
                stageId: input.stageId,
              }]
            : []),
        ],
        stages: [
          ...recurrence.stages,
          {
            endsBefore: null,
            id: input.stageId,
            rule: input.rule,
            startsOn: today,
          },
        ],
      };
    }
  }
  const recurrences = [...collection.recurrences];

  if (recurrenceIndex >= 0) recurrences[recurrenceIndex] = nextRecurrence;
  else recurrences.push(nextRecurrence);
  return replaceTodoCollectionWithTouchedBlock(
    content,
    collectionIndex,
    {
      ...collection,
      completions: ordinaryCompletion
        ? collection.completions.filter(({ blockId }) =>
            blockId !== input.blockId
          )
        : collection.completions,
      recurrences,
    },
    block,
    input.updatedAt,
  );
}

export function stopTodoBlockRecurrence(
  content: TodoContent,
  index: TodoParseIndex,
  input: StopTodoBlockRecurrenceInput,
) {
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const recurrenceIndex = collection.recurrences.findIndex(
    ({ blockId }) => blockId === input.blockId,
  );

  if (recurrenceIndex < 0) return content;
  const block = requireTodoItemBlock(
    index,
    input.collectionId,
    input.blockId,
  );
  const today = requireTodoLocalDate(input.today);
  const recurrence = collection.recurrences[recurrenceIndex];
  const projection = projectTodoRecurrence(recurrence, today);

  if (!projection.active || !projection.currentStage) return content;
  const endsBefore = addTodoLocalDays(today, 1);
  const retainedStages = recurrence.stages
    .filter(({ startsOn }) => startsOn <= today)
    .map((stage) =>
      stage.id === projection.currentStage!.id
        ? { ...stage, endsBefore }
        : stage
    );
  const retainedStageIds = new Set(retainedStages.map(({ id }) => id));
  const recurrences = [...collection.recurrences];

  recurrences[recurrenceIndex] = {
    ...recurrence,
    completions: recurrence.completions.filter(({ stageId }) =>
      retainedStageIds.has(stageId)
    ),
    stages: retainedStages,
  };
  const completions = collection.completions.filter(
    ({ blockId }) => blockId !== input.blockId,
  );

  if (projection.completedAt) {
    completions.push({
      blockId: input.blockId,
      completedAt: projection.completedAt,
    });
  }
  return replaceTodoCollectionWithTouchedBlock(
    content,
    collectionIndex,
    { ...collection, completions, recurrences },
    block,
    input.updatedAt,
  );
}

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
  const collectionIndex = findCollectionIndex(content, input.collectionId);
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
  canonicalTimestamp(input.updatedAt, "Todo block updatedAt");
  const result = moveCtnBlockWithinText({
    analysis: parsed.analysis,
    sourceBlock: blockRange(sourceBlock),
    targetPosition: resolveMoveTarget(input, blocks),
    updatedAt: input.updatedAt,
  });

  return {
    analysis: result.analysis,
    content: replaceCollection(content, collectionIndex, {
      ...collection,
      source: result.nextText,
    }),
  };
}

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
  canonicalTimestamp(input.updatedAt, "Todo syntax updatedAt");
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
    return cleanTodoSidecars(
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
