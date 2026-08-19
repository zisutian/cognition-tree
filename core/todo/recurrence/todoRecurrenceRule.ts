// SPDX-License-Identifier: GPL-3.0-or-later

import { DomainValidationError } from "../../errors/domainErrors.ts";
import type { TodoIsoWeekday } from "./todoLocalDate.ts";

export type TodoDailyRecurrenceRule = {
  interval: number;
  kind: "daily";
};

export type TodoWeeklyRecurrenceRule = {
  interval: number;
  kind: "weekly";
  weekdays: TodoIsoWeekday[];
};

export type TodoMonthlyRecurrenceRule = {
  dayOfMonth: number;
  interval: number;
  kind: "monthly";
};

export type TodoRecurrenceRule =
  | TodoDailyRecurrenceRule
  | TodoWeeklyRecurrenceRule
  | TodoMonthlyRecurrenceRule;

function requirePositiveInterval(interval: number) {
  if (!Number.isSafeInteger(interval) || interval < 1) {
    throw new DomainValidationError(
      "Todo recurrence interval must be a positive integer.",
    );
  }
}

export function validateTodoRecurrenceRule(
  rule: TodoRecurrenceRule,
): TodoRecurrenceRule {
  requirePositiveInterval(rule.interval);
  if (rule.kind === "daily") return rule;
  if (rule.kind === "monthly") {
    if (
      !Number.isSafeInteger(rule.dayOfMonth) ||
      rule.dayOfMonth < 1 ||
      rule.dayOfMonth > 31
    ) {
      throw new DomainValidationError(
        "Todo monthly recurrence day must be between 1 and 31.",
      );
    }
    return rule;
  }
  if (rule.weekdays.length === 0) {
    throw new DomainValidationError(
      "Todo weekly recurrence requires at least one weekday.",
    );
  }
  let previous = 0;

  for (const weekday of rule.weekdays) {
    if (
      !Number.isSafeInteger(weekday) ||
      weekday < 1 ||
      weekday > 7 ||
      weekday <= previous
    ) {
      throw new DomainValidationError(
        "Todo weekly recurrence weekdays must be unique and ascending.",
      );
    }
    previous = weekday;
  }
  return rule;
}
