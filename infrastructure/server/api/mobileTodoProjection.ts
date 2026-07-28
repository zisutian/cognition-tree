// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  MobileTodoRecurrenceDto,
} from "../../../contracts/mobile/types.ts";
import type {
  TodoCollection,
} from "../../../core/todo/model/todoContent.ts";
import {
  projectTodoRecurrence,
  type TodoLocalDate,
} from "../../../core/todo/recurrence/todoRecurrence.ts";

export type MobileTodoTaskStateProjection = {
  completedAt: string | null;
  recurrence: MobileTodoRecurrenceDto | null;
};

export function createMobileTodoTaskStateProjector(
  collection: TodoCollection,
  today: TodoLocalDate,
) {
  const ordinaryCompletionById = new Map(
    collection.completions.map(({ blockId, completedAt }) => [
      blockId,
      completedAt,
    ]),
  );
  const recurrenceById = new Map(
    collection.recurrences.map((recurrence) => {
      const projection = projectTodoRecurrence(recurrence, today);
      const projected: MobileTodoRecurrenceDto = {
        active: projection.active,
        completedCount: projection.completedCount,
        currentOccurrenceDate: projection.currentOccurrenceDate,
        nextOccurrenceDate: projection.nextOccurrenceDate,
        rule: projection.currentStage?.rule ??
          recurrence.stages.at(-1)!.rule,
        totalCount: projection.totalCount,
      };

      return [
        recurrence.blockId,
        {
          completedAt: projection.active
            ? projection.completedAt
            : ordinaryCompletionById.get(recurrence.blockId) ?? null,
          recurrence: projected,
        },
      ] as const;
    }),
  );

  return (blockId: string): MobileTodoTaskStateProjection =>
    recurrenceById.get(blockId) ?? {
      completedAt: ordinaryCompletionById.get(blockId) ?? null,
      recurrence: null,
    };
}
