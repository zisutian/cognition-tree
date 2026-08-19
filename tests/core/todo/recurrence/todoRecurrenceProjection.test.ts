// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  projectTodoRecurrence,
} from "../../../../core/todo/recurrence/todoRecurrenceProjection";
import type {
  TodoRecurrence,
} from "../../../../core/todo/recurrence/todoRecurrenceSchedule";
import {
  createTodoRecurrenceStage,
  todoRecurrenceStageId,
} from "./todoRecurrenceTestFixture";

describe("Todo recurrence projection", () => {
  it("derives daily status without creating missed backlog copies", () => {
    const recurrence: TodoRecurrence = {
      blockId: "00000000-0000-4000-8000-000000000001",
      completions: [{
        completedAt: "2026-07-20T08:00:00.000Z",
        occurrenceDate: "2026-07-20",
        stageId: todoRecurrenceStageId(1),
      }],
      stages: [createTodoRecurrenceStage({
        rule: { interval: 2, kind: "daily" },
      })],
    };

    expect(projectTodoRecurrence(recurrence, "2026-07-25")).toMatchObject({
      active: true,
      completed: false,
      completedCount: 1,
      currentOccurrenceDate: "2026-07-24",
      nextOccurrenceDate: "2026-07-26",
      totalCount: 4,
    });
    expect(projectTodoRecurrence(recurrence, "2026-07-20")).toMatchObject({
      completed: true,
      currentOccurrenceDate: "2026-07-20",
      totalCount: 2,
    });
  });

  it("keeps ended stages in statistics and projects only the active stage", () => {
    const recurrence: TodoRecurrence = {
      blockId: "00000000-0000-4000-8000-000000000001",
      completions: [],
      stages: [
        createTodoRecurrenceStage({ endsBefore: "2026-07-21" }),
        createTodoRecurrenceStage({
          id: todoRecurrenceStageId(2),
          rule: { interval: 2, kind: "daily" },
          startsOn: "2026-07-21",
        }),
      ],
    };

    expect(projectTodoRecurrence(recurrence, "2026-07-25")).toMatchObject({
      active: true,
      currentOccurrenceDate: "2026-07-25",
      nextOccurrenceDate: "2026-07-27",
      totalCount: 6,
    });
    recurrence.stages[1] = {
      ...recurrence.stages[1]!,
      endsBefore: "2026-07-26",
    };
    expect(projectTodoRecurrence(recurrence, "2026-07-26")).toMatchObject({
      active: false,
      currentOccurrenceDate: null,
      nextOccurrenceDate: null,
      totalCount: 6,
    });
  });
});
