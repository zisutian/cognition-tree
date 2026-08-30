// SPDX-License-Identifier: GPL-3.0-or-later

import { DomainValidationError } from "../../errors/domainErrors.ts";
import type { TodoParseIndex } from "../indexes/todoParseIndex.ts";
import type {
  TodoCollection,
  TodoCollectionId,
  TodoContent,
} from "../model/todoContent.ts";
import {
  addTodoLocalDays,
  requireTodoLocalDate,
  type TodoLocalDate,
} from "../recurrence/todoLocalDate.ts";
import {
  projectTodoRecurrence,
} from "../recurrence/todoRecurrenceProjection.ts";
import {
  todoRecurrenceRulesEqual,
  validateTodoRecurrenceRule,
  type TodoRecurrenceRule,
} from "../recurrence/todoRecurrenceRule.ts";
import {
  isTodoRecurrenceStageId,
  type TodoRecurrence,
  type TodoRecurrenceStageId,
} from "../recurrence/todoRecurrenceSchedule.ts";
import {
  TodoOccurrenceConflictError,
} from "../recurrence/todoOccurrenceConflict.ts";
import {
  findTodoCollectionIndex,
  readTodoCommandTimestamp,
  replaceTodoCollectionWithTouchedBlock,
  requireTodoItemBlock,
} from "./todoCommandSupport.ts";

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

export function toggleTodoBlock(
  content: TodoContent,
  index: TodoParseIndex,
  input: ToggleTodoBlockInput,
) {
  const collectionIndex = findTodoCollectionIndex(
    content,
    input.collectionId,
  );
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

export function setTodoBlockCompletion(
  content: TodoContent,
  index: TodoParseIndex,
  input: SetTodoBlockCompletionInput,
) {
  const collectionIndex = findTodoCollectionIndex(
    content,
    input.collectionId,
  );
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
      const completedAt = readTodoCommandTimestamp(
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
    const completedAt = readTodoCommandTimestamp(
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

export function setTodoBlockRecurrence(
  content: TodoContent,
  index: TodoParseIndex,
  input: SetTodoBlockRecurrenceInput,
) {
  const collectionIndex = findTodoCollectionIndex(
    content,
    input.collectionId,
  );
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
        if (todoRecurrenceRulesEqual(lastStage.rule, input.rule)) {
          return content;
        }
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
          todoRecurrenceRulesEqual(projection.currentStage.rule, input.rule)
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
  const collectionIndex = findTodoCollectionIndex(
    content,
    input.collectionId,
  );
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
