// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  addTodoLocalDays,
  countTodoRecurrenceStageOccurrences,
  getNextTodoRecurrenceStageOccurrence,
  isTodoRecurrenceStageOccurrence,
  projectTodoRecurrence,
  type TodoRecurrence,
  type TodoRecurrenceStage,
} from "../../../../core/todo/recurrence/todoRecurrence";

const stageId = (index: number) =>
  `todo-recurrence-stage-00000000-0000-4000-8000-${String(index).padStart(
    12,
    "0",
  )}` as const;

function stage(
  overrides: Partial<TodoRecurrenceStage> = {},
): TodoRecurrenceStage {
  return {
    endsBefore: null,
    id: stageId(1),
    rule: { interval: 1, kind: "daily" },
    startsOn: "2026-07-18",
    ...overrides,
  };
}

describe("Todo recurrence calendar", () => {
  it("derives daily status without creating missed backlog copies", () => {
    const recurrence: TodoRecurrence = {
      blockId: "00000000-0000-4000-8000-000000000001",
      completions: [{
        completedAt: "2026-07-20T08:00:00.000Z",
        occurrenceDate: "2026-07-20",
        stageId: stageId(1),
      }],
      stages: [stage({
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

  it("supports interval weeks with ascending ISO weekday sets", () => {
    const weekly = stage({
      rule: { interval: 1, kind: "weekly", weekdays: [1, 5] },
      startsOn: "2026-07-15",
    });

    expect(countTodoRecurrenceStageOccurrences(weekly, "2026-07-25")).toBe(4);
    expect(getNextTodoRecurrenceStageOccurrence(weekly, "2026-07-25"))
      .toBe("2026-07-27");
    expect(isTodoRecurrenceStageOccurrence(weekly, "2026-07-24")).toBe(true);
    expect(isTodoRecurrenceStageOccurrence(weekly, "2026-07-23")).toBe(false);

    const fortnightly = stage({
      rule: { interval: 2, kind: "weekly", weekdays: [1, 5] },
      startsOn: "2026-07-15",
    });

    expect(countTodoRecurrenceStageOccurrences(fortnightly, "2026-07-31"))
      .toBe(4);
  });

  it("clamps monthly days to month end including leap years", () => {
    const leap = stage({
      rule: { dayOfMonth: 31, interval: 1, kind: "monthly" },
      startsOn: "2024-01-31",
    });
    const common = stage({
      rule: { dayOfMonth: 31, interval: 1, kind: "monthly" },
      startsOn: "2023-01-31",
    });

    expect(getNextTodoRecurrenceStageOccurrence(leap, "2024-01-31"))
      .toBe("2024-02-29");
    expect(getNextTodoRecurrenceStageOccurrence(leap, "2024-02-29"))
      .toBe("2024-03-31");
    expect(getNextTodoRecurrenceStageOccurrence(common, "2023-01-31"))
      .toBe("2023-02-28");
    expect(countTodoRecurrenceStageOccurrences(leap, "2024-03-31")).toBe(3);
  });

  it("keeps ended stages in statistics and projects only the active stage", () => {
    const recurrence: TodoRecurrence = {
      blockId: "00000000-0000-4000-8000-000000000001",
      completions: [],
      stages: [
        stage({ endsBefore: "2026-07-21" }),
        stage({
          id: stageId(2),
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

  it("uses deterministic Gregorian day arithmetic", () => {
    expect(addTodoLocalDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addTodoLocalDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addTodoLocalDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});
