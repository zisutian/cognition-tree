// SPDX-License-Identifier: GPL-3.0-or-later

import {
  projectTodoRecurrence,
  todoItemSemanticType,
  type ParsedTodoIndexCollection,
  type TodoLocalDate,
} from "../../core/todo/index.ts";
import type { TodoDomainVersions } from "./todoDomainCommands.ts";

export function projectTodoItemStates(
  parsed: ParsedTodoIndexCollection,
  today: TodoLocalDate,
  version: TodoDomainVersions["itemState"],
) {
  const ordinaryCompletionById = new Map(
    parsed.collection.completions.map(({ blockId, completedAt }) => [
      blockId,
      completedAt,
    ]),
  );
  const recurrenceById = new Map(
    parsed.collection.recurrences.map((recurrence) => {
      const projection = projectTodoRecurrence(recurrence, today);

      return [
        recurrence.blockId,
        {
          active: projection.active,
          completedAt: projection.active
            ? projection.completedAt
            : (ordinaryCompletionById.get(recurrence.blockId) ?? null),
          recurrence: {
            active: projection.active,
            completedCount: projection.completedCount,
            currentOccurrenceDate: projection.currentOccurrenceDate,
            nextOccurrenceDate: projection.nextOccurrenceDate,
            rule:
              projection.currentStage?.rule ?? recurrence.stages.at(-1)!.rule,
            totalCount: projection.totalCount,
          },
        },
      ] as const;
    }),
  );

  return parsed.analysis.document.blocks
    .filter(({ rule }) => rule.semanticId === todoItemSemanticType)
    .map((block) => {
      const recurrence = recurrenceById.get(block.id);
      const completedAt =
        recurrence?.completedAt ?? ordinaryCompletionById.get(block.id) ?? null;

      return {
        blockId: block.id,
        completed: completedAt !== null,
        completedAt,
        recurrence: recurrence?.recurrence ?? null,
        stateVersion: version(parsed.collection, block.id),
      };
    });
}

export type TodoItemState = ReturnType<typeof projectTodoItemStates>[number];
