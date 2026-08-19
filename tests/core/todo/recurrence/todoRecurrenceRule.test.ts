// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  validateTodoRecurrenceRule,
} from "../../../../core/todo/recurrence/todoRecurrenceRule";

describe("Todo recurrence rule", () => {
  it("requires a positive integer interval", () => {
    expect(() => validateTodoRecurrenceRule({
      interval: 0,
      kind: "daily",
    })).toThrow(/positive integer/);
  });

  it("requires unique ascending weekly weekdays", () => {
    expect(() => validateTodoRecurrenceRule({
      interval: 1,
      kind: "weekly",
      weekdays: [5, 1],
    })).toThrow(/unique and ascending/);
  });

  it("limits monthly days to the Gregorian month range", () => {
    expect(() => validateTodoRecurrenceRule({
      dayOfMonth: 32,
      interval: 1,
      kind: "monthly",
    })).toThrow(/between 1 and 31/);
  });
});
