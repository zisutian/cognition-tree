// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  projectTodoRecurrence,
} from "../../../../../core/todo/recurrence/todoRecurrenceProjection";
import type {
  TodoRecurrence,
} from "../../../../../core/todo/recurrence/todoRecurrenceSchedule";
import {
  createTodoRecurrenceStage,
  todoRecurrenceStageId,
} from "../../../../support/core/todo/recurrence/todoRecurrenceTestFixture";

describe("Todo recurrence projection", () => {
  it("projects the next stage while preserving today's occurrence and completion", () => {
    const first = createTodoRecurrenceStage({ endsBefore: "2026-07-21" });
    const second = createTodoRecurrenceStage({
      id: todoRecurrenceStageId(2),
      startsOn: "2026-07-21",
      rule: { interval: 2, kind: "daily" },
    });
    const recurrence: TodoRecurrence = {
      blockId: "00000000-0000-4000-8000-000000000001",
      stages: [first, second],
      completions: [{
        stageId: first.id,
        occurrenceDate: "2026-07-20",
        completedAt: "2026-07-20T08:00:00.000Z",
      }],
    };

    expect(projectTodoRecurrence(recurrence, "2026-07-20")).toMatchObject({
      active: true,
      completed: true,
      completedCount: 1,
      currentStage: first,
      currentOccurrenceDate: "2026-07-20",
      nextOccurrenceDate: "2026-07-21",
      totalCount: 3,
    });
    expect(projectTodoRecurrence(recurrence, "2026-07-21")).toMatchObject({
      completed: false,
      currentStage: second,
      currentOccurrenceDate: "2026-07-21",
      nextOccurrenceDate: "2026-07-23",
      totalCount: 4,
    });
  });

  it("finds the nearest future occurrence before the first stage and between stages", () => {
    const recurrence: TodoRecurrence = {
      blockId: "00000000-0000-4000-8000-000000000001",
      completions: [],
      stages: [
        createTodoRecurrenceStage({ endsBefore: "2026-07-20" }),
        createTodoRecurrenceStage({ id: todoRecurrenceStageId(2), startsOn: "2026-07-23" }),
      ],
    };

    expect(projectTodoRecurrence(recurrence, "2026-07-17")).toMatchObject({
      currentStage: null,
      nextOccurrenceDate: "2026-07-18",
    });
    expect(projectTodoRecurrence(recurrence, "2026-07-18").nextOccurrenceDate).toBe("2026-07-19");
    expect(projectTodoRecurrence(recurrence, "2026-07-21")).toMatchObject({
      currentStage: null,
      nextOccurrenceDate: "2026-07-23",
    });
  });

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
