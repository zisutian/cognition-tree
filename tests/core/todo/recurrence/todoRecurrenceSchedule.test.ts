// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  countTodoRecurrenceStageOccurrences,
  getNextTodoRecurrenceStageOccurrence,
  isTodoRecurrenceStageOccurrence,
} from "../../../../core/todo/recurrence/todoRecurrenceSchedule";
import {
  createTodoRecurrenceStage,
} from "./todoRecurrenceTestFixture";

describe("Todo recurrence schedule", () => {
  it("supports interval weeks with ascending ISO weekday sets", () => {
    const weekly = createTodoRecurrenceStage({
      rule: { interval: 1, kind: "weekly", weekdays: [1, 5] },
      startsOn: "2026-07-15",
    });

    expect(countTodoRecurrenceStageOccurrences(weekly, "2026-07-25")).toBe(4);
    expect(getNextTodoRecurrenceStageOccurrence(weekly, "2026-07-25"))
      .toBe("2026-07-27");
    expect(isTodoRecurrenceStageOccurrence(weekly, "2026-07-24")).toBe(true);
    expect(isTodoRecurrenceStageOccurrence(weekly, "2026-07-23")).toBe(false);

    const fortnightly = createTodoRecurrenceStage({
      rule: { interval: 2, kind: "weekly", weekdays: [1, 5] },
      startsOn: "2026-07-15",
    });

    expect(countTodoRecurrenceStageOccurrences(fortnightly, "2026-07-31"))
      .toBe(4);
  });

  it("clamps monthly days to month end including leap years", () => {
    const leap = createTodoRecurrenceStage({
      rule: { dayOfMonth: 31, interval: 1, kind: "monthly" },
      startsOn: "2024-01-31",
    });
    const common = createTodoRecurrenceStage({
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
});
