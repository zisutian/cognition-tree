// SPDX-License-Identifier: GPL-3.0-or-later

import {
  compareTodoLocalDates,
  requireTodoLocalDate,
  type TodoLocalDate,
} from "./todoLocalDate.ts";
import {
  countTodoRecurrenceStageOccurrences,
  getLatestTodoRecurrenceStageOccurrence,
  getNextTodoRecurrenceStageOccurrence,
  isTodoRecurrenceEnabled,
  type TodoRecurrence,
  type TodoRecurrenceStage,
} from "./todoRecurrenceSchedule.ts";

export type TodoRecurrenceProjection = {
  active: boolean;
  completed: boolean;
  completedAt: string | null;
  completedCount: number;
  currentOccurrenceDate: TodoLocalDate | null;
  currentStage: TodoRecurrenceStage | null;
  nextOccurrenceDate: TodoLocalDate | null;
  totalCount: number;
};

function currentStage(
  recurrence: TodoRecurrence,
  today: TodoLocalDate,
) {
  return [...recurrence.stages].reverse().find((stage) =>
    compareTodoLocalDates(stage.startsOn, today) <= 0 &&
    (!stage.endsBefore ||
      compareTodoLocalDates(today, stage.endsBefore) < 0)
  ) ?? null;
}

function nextOccurrenceDate(recurrence: TodoRecurrence, today: TodoLocalDate) {
  let next: TodoLocalDate | null = null;

  for (const stage of recurrence.stages) {
    if (stage.endsBefore && compareTodoLocalDates(stage.endsBefore, today) <= 0) {
      continue;
    }
    const candidate = getNextTodoRecurrenceStageOccurrence(stage, today);

    if (candidate && (!next || compareTodoLocalDates(candidate, next) < 0)) {
      next = candidate;
    }
  }
  return next;
}

export function projectTodoRecurrence(
  recurrence: TodoRecurrence,
  today: TodoLocalDate,
): TodoRecurrenceProjection {
  requireTodoLocalDate(today);
  const active = isTodoRecurrenceEnabled(recurrence);
  const stage = active ? currentStage(recurrence, today) : null;
  const currentOccurrenceDate = stage
    ? getLatestTodoRecurrenceStageOccurrence(stage, today)
    : null;
  const completion = currentOccurrenceDate && stage
    ? recurrence.completions.find((candidate) =>
        candidate.stageId === stage.id &&
        candidate.occurrenceDate === currentOccurrenceDate
      ) ?? null
    : null;

  return {
    active,
    completed: completion !== null,
    completedAt: completion?.completedAt ?? null,
    completedCount: recurrence.completions.length,
    currentOccurrenceDate,
    currentStage: stage,
    nextOccurrenceDate: active
      ? nextOccurrenceDate(recurrence, today)
      : null,
    totalCount: recurrence.stages.reduce(
      (count, candidate) =>
        count + countTodoRecurrenceStageOccurrences(candidate, today),
      0,
    ),
  };
}
