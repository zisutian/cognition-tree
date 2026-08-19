// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  TodoRecurrenceStage,
} from "../../../../core/todo/recurrence/todoRecurrenceSchedule";

export const todoRecurrenceStageId = (index: number) =>
  `todo-recurrence-stage-00000000-0000-4000-8000-${String(index).padStart(
    12,
    "0",
  )}` as const;

export function createTodoRecurrenceStage(
  overrides: Partial<TodoRecurrenceStage> = {},
): TodoRecurrenceStage {
  return {
    endsBefore: null,
    id: todoRecurrenceStageId(1),
    rule: { interval: 1, kind: "daily" },
    startsOn: "2026-07-18",
    ...overrides,
  };
}
