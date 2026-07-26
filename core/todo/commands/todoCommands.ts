// SPDX-License-Identifier: GPL-3.0-or-later

import { reconcileCtnSourceBlockMetadata } from "../../ctn/metadata/reconcileSourceMetadata.ts";
import {
  initializeCtnSourceBlockMetadata,
  replaceCtnSourceTitle,
} from "../../ctn/metadata/sourceMetadata.ts";
import {
  assertCtnEditableSourceChange,
  type CtnEditableSourceChange,
} from "../../ctn/metadata/textEdits.ts";
import {
  moveCtnBlockWithinText,
  type CtnBlockTextTargetPosition,
} from "../../ctn/parser/blockTextEdit.ts";
import {
  parseCtnCanonicalDocument,
  readCtnCanonicalTitleHeader,
} from "../../ctn/parser/parseCtnDocument.ts";
import type { CtnCanonicalBlock } from "../../ctn/parser/types.ts";
import {
  createPortableNameKey,
  parsePortableName,
} from "../../naming/portableName.ts";
import {
  collectTodoBlockIds,
  createTodoCollectionBodyProjection,
  isTodoCollectionId,
  parseTodoCollection,
  todoItemSemanticType,
  validateTodoContent,
  type TodoCollection,
  type TodoCollectionId,
  type TodoContent,
} from "../model/todoContent.ts";
import {
  addTodoLocalDays,
  isTodoRecurrenceStageId,
  projectTodoRecurrence,
  requireTodoLocalDate,
  validateTodoRecurrenceRule,
  type TodoLocalDate,
  type TodoRecurrence,
  type TodoRecurrenceRule,
  type TodoRecurrenceStageId,
} from "../recurrence/todoRecurrence.ts";
import {
  requireTodoSyntaxProfile,
} from "../syntax/todoSyntax.ts";

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
};

export type StopTodoBlockRecurrenceInput = {
  blockId: string;
  collectionId: TodoCollectionId;
  today: TodoLocalDate;
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

function canonicalTimestamp(value: string, label: string) {
  const milliseconds = Date.parse(value);

  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new Error(`${label} must be a canonical ISO timestamp.`);
  }
  return milliseconds;
}

function findCollectionIndex(
  content: TodoContent,
  collectionId: TodoCollectionId,
) {
  const index = content.collections.findIndex(({ id }) => id === collectionId);

  if (index < 0) {
    throw new Error(`Todo collection does not exist: ${collectionId}`);
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
  const next = { ...content, collections };

  validateTodoContent(next);
  return next;
}

function assertTargetIndex(toIndex: number, length: number, label: string) {
  if (!Number.isSafeInteger(toIndex) || toIndex < 0 || toIndex >= length) {
    throw new Error(`${label} target index is out of bounds: ${toIndex}`);
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
  syntaxProfile: ReturnType<typeof requireTodoSyntaxProfile>,
) {
  const document = parseCtnCanonicalDocument(collection.source, syntaxProfile);
  const itemIds = new Set(
    document.blocks
      .filter(({ type }) => type === todoItemSemanticType)
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
  content: TodoContent,
  name: string,
  exceptCollectionId?: TodoCollectionId,
) {
  const syntaxProfile = requireTodoSyntaxProfile(content.syntaxSource);
  const key = createPortableNameKey(name);
  const conflict = content.collections.find((collection) =>
    collection.id !== exceptCollectionId &&
    createPortableNameKey(parseTodoCollection(collection, syntaxProfile).name) ===
      key
  );

  if (conflict) {
    throw new Error(`Todo collection name already exists: ${name}`);
  }
}

export function createTodoCollection(
  content: TodoContent,
  input: CreateTodoCollectionInput,
) {
  validateTodoContent(content);
  if (!isTodoCollectionId(input.collectionId)) {
    throw new Error(`Invalid todo collection id: ${input.collectionId}`);
  }
  if (content.collections.some(({ id }) => id === input.collectionId)) {
    throw new Error(`Todo collection already exists: ${input.collectionId}`);
  }
  canonicalTimestamp(input.createdAt, "Todo collection createdAt");
  const name = parsePortableName(input.name, "Todo collection name");
  assertCollectionNameAvailable(content, name);
  const syntaxProfile = requireTodoSyntaxProfile(content.syntaxSource);
  const source = initializeCtnSourceBlockMetadata(name, syntaxProfile, {
    createId: input.createBlockId,
    createdAt: input.createdAt,
    reservedIds: collectTodoBlockIds(content, syntaxProfile),
    updatedAt: input.createdAt,
  });
  const next: TodoContent = {
    ...content,
    collections: [
      ...content.collections,
      { completions: [], id: input.collectionId, recurrences: [], source },
    ],
  };

  validateTodoContent(next);
  return { collectionId: input.collectionId, content: next };
}

export function renameTodoCollection(
  content: TodoContent,
  input: RenameTodoCollectionInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const name = parsePortableName(input.name, "Todo collection name");
  const current = readCtnCanonicalTitleHeader(collection.source);

  if (current.title === name) return content;
  assertCollectionNameAvailable(content, name, input.collectionId);
  canonicalTimestamp(input.updatedAt, "Todo collection updatedAt");
  if (Date.parse(input.updatedAt) < Date.parse(current.metadata.updatedAt)) {
    throw new Error("Todo collection updatedAt cannot move backwards.");
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
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, collectionId);
  const collections = [...content.collections];

  collections.splice(collectionIndex, 1);
  const next = { ...content, collections };

  validateTodoContent(next);
  return next;
}

export function moveTodoCollection(
  content: TodoContent,
  input: MoveTodoCollectionInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);

  assertTargetIndex(input.toIndex, content.collections.length, "Todo collection");
  if (collectionIndex === input.toIndex) return content;
  const next = {
    ...content,
    collections: moveAt(content.collections, collectionIndex, input.toIndex),
  };

  validateTodoContent(next);
  return next;
}

export function updateTodoCollectionBody(
  content: TodoContent,
  input: UpdateTodoCollectionBodyInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const syntaxProfile = requireTodoSyntaxProfile(content.syntaxSource);
  const current = createTodoCollectionBodyProjection(collection, syntaxProfile);

  assertCtnEditableSourceChange(current.source, input.change);
  if (current.source === input.change.source) return content;
  canonicalTimestamp(input.updatedAt, "Todo collection updatedAt");
  const titleMetadata = readCtnCanonicalTitleHeader(collection.source).metadata;

  if (Date.parse(input.updatedAt) < Date.parse(titleMetadata.updatedAt)) {
    throw new Error("Todo collection updatedAt cannot move backwards.");
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
  const source = reconcileCtnSourceBlockMetadata(
    collection.source,
    { edits, source: nextEditableSource },
    syntaxProfile,
    {
      createId: input.createBlockId,
      reservedIds: collectTodoBlockIds(content, syntaxProfile),
      timestamp: input.updatedAt,
    },
  );
  const withSource = cleanTodoSidecars(
    { ...collection, source },
    syntaxProfile,
  );

  return replaceCollection(content, collectionIndex, withSource);
}

function requireTodoItemBlock(
  collection: TodoCollection,
  syntaxProfile: ReturnType<typeof requireTodoSyntaxProfile>,
  blockId: string,
) {
  const parsed = parseTodoCollection(collection, syntaxProfile);
  const block = parsed.document.blocks.find(({ id }) => id === blockId);

  if (!block || block.type !== todoItemSemanticType) {
    throw new Error(`Todo item block does not exist: ${blockId}`);
  }
  return block;
}

export function toggleTodoBlock(
  content: TodoContent,
  input: ToggleTodoBlockInput,
) {
  validateTodoContent(content);
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

  return setTodoBlockCompletion(content, {
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
  input: SetTodoBlockCompletionInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const syntaxProfile = requireTodoSyntaxProfile(content.syntaxSource);
  const block = requireTodoItemBlock(collection, syntaxProfile, input.blockId);
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
        throw new Error("Todo completion cannot predate its block.");
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
    return replaceCollection(content, collectionIndex, {
      ...collection,
      recurrences,
    });
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
      throw new Error("Todo completion cannot predate its block.");
    }
    completions.push({ blockId: input.blockId, completedAt: input.completedAt });
  } else {
    return content;
  }

  return replaceCollection(content, collectionIndex, {
    ...collection,
    completions,
  });
}

function assertNewRecurrenceStageId(
  collection: TodoCollection,
  stageId: TodoRecurrenceStageId,
) {
  if (!isTodoRecurrenceStageId(stageId)) {
    throw new Error(`Invalid Todo recurrence stage id: ${stageId}`);
  }
  if (
    collection.recurrences.some(({ stages }) =>
      stages.some(({ id }) => id === stageId)
    )
  ) {
    throw new Error(`Todo recurrence stage already exists: ${stageId}`);
  }
}

function rulesEqual(left: TodoRecurrenceRule, right: TodoRecurrenceRule) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function setTodoBlockRecurrence(
  content: TodoContent,
  input: SetTodoBlockRecurrenceInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const syntaxProfile = requireTodoSyntaxProfile(content.syntaxSource);

  requireTodoItemBlock(collection, syntaxProfile, input.blockId);
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
  return replaceCollection(content, collectionIndex, {
    ...collection,
    completions: ordinaryCompletion
      ? collection.completions.filter(({ blockId }) => blockId !== input.blockId)
      : collection.completions,
    recurrences,
  });
}

export function stopTodoBlockRecurrence(
  content: TodoContent,
  input: StopTodoBlockRecurrenceInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const recurrenceIndex = collection.recurrences.findIndex(
    ({ blockId }) => blockId === input.blockId,
  );

  if (recurrenceIndex < 0) return content;
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
  return replaceCollection(content, collectionIndex, {
    ...collection,
    recurrences,
  });
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

  if (!target || target.type === "title") {
    throw new Error(`Todo target block does not exist: ${input.target.targetBlockId}`);
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
  input: MoveTodoBlockInput,
) {
  validateTodoContent(content);
  const collectionIndex = findCollectionIndex(content, input.collectionId);
  const collection = content.collections[collectionIndex];
  const syntaxProfile = requireTodoSyntaxProfile(content.syntaxSource);
  const parsed = parseTodoCollection(collection, syntaxProfile);
  const blocks = new Map(parsed.document.blocks.map((block) => [block.id, block]));
  const sourceBlock = blocks.get(input.blockId);

  if (!sourceBlock || sourceBlock.type === syntaxProfile.titleRule.type) {
    throw new Error(`Todo source block does not exist: ${input.blockId}`);
  }
  canonicalTimestamp(input.updatedAt, "Todo block updatedAt");
  const result = moveCtnBlockWithinText({
    sourceBlock: blockRange(sourceBlock),
    sourceText: collection.source,
    syntaxProfile,
    targetPosition: resolveMoveTarget(input, blocks),
    updatedAt: input.updatedAt,
  });

  return replaceCollection(content, collectionIndex, {
    ...collection,
    source: result.nextText,
  });
}

export function updateTodoSyntaxSource(
  content: TodoContent,
  syntaxSource: string,
) {
  validateTodoContent(content);
  if (content.syntaxSource === syntaxSource) return content;
  const syntaxProfile = requireTodoSyntaxProfile(syntaxSource);
  const next = {
    ...content,
    syntaxSource,
    collections: content.collections.map((collection) =>
      cleanTodoSidecars(collection, syntaxProfile)
    ),
  };

  validateTodoContent(next);
  return next;
}
