// SPDX-License-Identifier: GPL-3.0-or-later

import { DomainValidationError } from "../../errors/domainErrors.ts";
import {
  addTodoLocalDays,
  compareTodoLocalDates,
  formatTodoLocalDateEpochDay,
  getTodoGregorianDayOfMonth,
  getTodoGregorianEpochDay,
  getTodoIsoWeekday,
  parseTodoLocalDate,
  type TodoLocalDate,
} from "./todoLocalDate.ts";
import {
  validateTodoRecurrenceRule,
  type TodoDailyRecurrenceRule,
  type TodoMonthlyRecurrenceRule,
  type TodoRecurrenceRule,
  type TodoWeeklyRecurrenceRule,
} from "./todoRecurrenceRule.ts";

export type TodoRecurrenceStageId = `todo-recurrence-stage-${string}`;

export type TodoRecurrenceStage = {
  endsBefore: TodoLocalDate | null;
  id: TodoRecurrenceStageId;
  rule: TodoRecurrenceRule;
  startsOn: TodoLocalDate;
};

export type TodoRecurrenceCompletion = {
  completedAt: string;
  occurrenceDate: TodoLocalDate;
  stageId: TodoRecurrenceStageId;
};

export type TodoRecurrence = {
  blockId: string;
  completions: TodoRecurrenceCompletion[];
  stages: TodoRecurrenceStage[];
};

const stageIdPattern =
  /^todo-recurrence-stage-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isTodoRecurrenceStageId(
  value: string,
): value is TodoRecurrenceStageId {
  return stageIdPattern.test(value);
}

export function isTodoRecurrenceEnabled(recurrence: TodoRecurrence) {
  return recurrence.stages.at(-1)?.endsBefore === null;
}

function stageLastDate(
  stage: TodoRecurrenceStage,
  throughDate: TodoLocalDate,
) {
  if (compareTodoLocalDates(throughDate, stage.startsOn) < 0) return null;
  if (
    stage.endsBefore &&
    compareTodoLocalDates(throughDate, stage.endsBefore) >= 0
  ) {
    return addTodoLocalDays(stage.endsBefore, -1);
  }
  return throughDate;
}

function monthIndex(year: number, month: number) {
  return year * 12 + month - 1;
}

function dateInMonth(
  index: number,
  dayOfMonth: number,
): TodoLocalDate {
  const year = Math.floor(index / 12);
  const month = index % 12 + 1;
  const nextMonthEpoch = getTodoGregorianEpochDay(
    month === 12 ? year + 1 : year,
    month === 12 ? 1 : month + 1,
    1,
  );

  if (nextMonthEpoch === null) {
    throw new DomainValidationError(
      "Todo recurrence month is outside the supported range.",
    );
  }
  const lastDay = getTodoGregorianDayOfMonth(nextMonthEpoch - 1);
  const epochDay = getTodoGregorianEpochDay(
    year,
    month,
    Math.min(dayOfMonth, lastDay),
  );

  if (epochDay === null) {
    throw new DomainValidationError(
      "Todo recurrence month is outside the supported range.",
    );
  }
  return formatTodoLocalDateEpochDay(epochDay);
}

function dailyCount(
  stage: TodoRecurrenceStage,
  lastDate: TodoLocalDate,
) {
  const start = parseTodoLocalDate(stage.startsOn)!;
  const end = parseTodoLocalDate(lastDate)!;
  const rule = stage.rule as TodoDailyRecurrenceRule;

  return Math.floor((end.epochDay - start.epochDay) / rule.interval) + 1;
}

function weeklyCount(
  stage: TodoRecurrenceStage,
  lastDate: TodoLocalDate,
) {
  const start = parseTodoLocalDate(stage.startsOn)!;
  const end = parseTodoLocalDate(lastDate)!;
  const rule = stage.rule as TodoWeeklyRecurrenceRule;
  const startWeekday = getTodoIsoWeekday(stage.startsOn);
  const anchorMonday = start.epochDay - (startWeekday - 1);
  const step = rule.interval * 7;
  let count = 1;

  for (const weekday of rule.weekdays) {
    let candidate = anchorMonday + weekday - 1;

    if (candidate <= start.epochDay) candidate += step;
    if (candidate <= end.epochDay) {
      count += Math.floor((end.epochDay - candidate) / step) + 1;
    }
  }
  return count;
}

function monthlyCount(
  stage: TodoRecurrenceStage,
  lastDate: TodoLocalDate,
) {
  const start = parseTodoLocalDate(stage.startsOn)!;
  const end = parseTodoLocalDate(lastDate)!;
  const rule = stage.rule as TodoMonthlyRecurrenceRule;
  const startMonth = monthIndex(start.year, start.month);
  const endMonth = monthIndex(end.year, end.month);
  let stepIndex = 0;
  let count = 1;
  let candidate = dateInMonth(startMonth, rule.dayOfMonth);

  if (compareTodoLocalDates(candidate, stage.startsOn) <= 0) {
    stepIndex = 1;
  }
  const lastStep = Math.floor((endMonth - startMonth) / rule.interval);

  if (lastStep < stepIndex) return count;
  count += lastStep - stepIndex + 1;
  candidate = dateInMonth(
    startMonth + lastStep * rule.interval,
    rule.dayOfMonth,
  );
  if (compareTodoLocalDates(candidate, lastDate) > 0) count -= 1;
  return count;
}

export function countTodoRecurrenceStageOccurrences(
  stage: TodoRecurrenceStage,
  throughDate: TodoLocalDate,
) {
  validateTodoRecurrenceRule(stage.rule);
  const lastDate = stageLastDate(stage, throughDate);

  if (!lastDate) return 0;
  switch (stage.rule.kind) {
    case "daily":
      return dailyCount(stage, lastDate);
    case "weekly":
      return weeklyCount(stage, lastDate);
    case "monthly":
      return monthlyCount(stage, lastDate);
  }
}

function nextDailyOccurrence(
  stage: TodoRecurrenceStage,
  afterDate: TodoLocalDate,
) {
  const start = parseTodoLocalDate(stage.startsOn)!;
  const after = parseTodoLocalDate(afterDate)!;
  const rule = stage.rule as TodoDailyRecurrenceRule;
  const offset = after.epochDay < start.epochDay
    ? 0
    : Math.floor((after.epochDay - start.epochDay) / rule.interval) + 1;

  return formatTodoLocalDateEpochDay(
    start.epochDay + offset * rule.interval,
  );
}

function nextWeeklyOccurrence(
  stage: TodoRecurrenceStage,
  afterDate: TodoLocalDate,
) {
  if (compareTodoLocalDates(afterDate, stage.startsOn) < 0) {
    return stage.startsOn;
  }
  const start = parseTodoLocalDate(stage.startsOn)!;
  const after = parseTodoLocalDate(afterDate)!;
  const rule = stage.rule as TodoWeeklyRecurrenceRule;
  const anchorMonday =
    start.epochDay - (getTodoIsoWeekday(stage.startsOn) - 1);
  const step = rule.interval * 7;
  let nextEpochDay = Number.POSITIVE_INFINITY;

  for (const weekday of rule.weekdays) {
    const initial = anchorMonday + weekday - 1;
    const multiplier = initial > after.epochDay
      ? 0
      : Math.floor((after.epochDay - initial) / step) + 1;
    const candidate = initial + multiplier * step;

    if (candidate > start.epochDay) {
      nextEpochDay = Math.min(nextEpochDay, candidate);
    }
  }
  return formatTodoLocalDateEpochDay(nextEpochDay);
}

function nextMonthlyOccurrence(
  stage: TodoRecurrenceStage,
  afterDate: TodoLocalDate,
) {
  if (compareTodoLocalDates(afterDate, stage.startsOn) < 0) {
    return stage.startsOn;
  }
  const start = parseTodoLocalDate(stage.startsOn)!;
  const after = parseTodoLocalDate(afterDate)!;
  const rule = stage.rule as TodoMonthlyRecurrenceRule;
  const startMonth = monthIndex(start.year, start.month);
  const afterMonth = monthIndex(after.year, after.month);
  let step = Math.max(
    0,
    Math.floor((afterMonth - startMonth) / rule.interval),
  );

  while (true) {
    const candidate = dateInMonth(
      startMonth + step * rule.interval,
      rule.dayOfMonth,
    );

    if (
      compareTodoLocalDates(candidate, stage.startsOn) > 0 &&
      compareTodoLocalDates(candidate, afterDate) > 0
    ) {
      return candidate;
    }
    step += 1;
  }
}

export function getNextTodoRecurrenceStageOccurrence(
  stage: TodoRecurrenceStage,
  afterDate: TodoLocalDate,
): TodoLocalDate | null {
  validateTodoRecurrenceRule(stage.rule);
  const candidate = stage.rule.kind === "daily"
    ? nextDailyOccurrence(stage, afterDate)
    : stage.rule.kind === "weekly"
      ? nextWeeklyOccurrence(stage, afterDate)
      : nextMonthlyOccurrence(stage, afterDate);

  return stage.endsBefore &&
      compareTodoLocalDates(candidate, stage.endsBefore) >= 0
    ? null
    : candidate;
}

export function isTodoRecurrenceStageOccurrence(
  stage: TodoRecurrenceStage,
  date: TodoLocalDate,
) {
  if (
    compareTodoLocalDates(date, stage.startsOn) < 0 ||
    (stage.endsBefore &&
      compareTodoLocalDates(date, stage.endsBefore) >= 0)
  ) {
    return false;
  }
  if (date === stage.startsOn) return true;
  return getNextTodoRecurrenceStageOccurrence(
    stage,
    addTodoLocalDays(date, -1),
  ) === date;
}

export function getLatestTodoRecurrenceStageOccurrence(
  stage: TodoRecurrenceStage,
  throughDate: TodoLocalDate,
) {
  if (compareTodoLocalDates(throughDate, stage.startsOn) < 0) return null;
  const end = stageLastDate(stage, throughDate);

  if (!end) return null;
  const start = parseTodoLocalDate(stage.startsOn)!;
  const through = parseTodoLocalDate(end)!;
  if (stage.rule.kind === "daily") {
    const offset = Math.floor(
      (through.epochDay - start.epochDay) / stage.rule.interval,
    );

    return formatTodoLocalDateEpochDay(
      start.epochDay + offset * stage.rule.interval,
    );
  }
  if (stage.rule.kind === "weekly") {
    const anchorMonday =
      start.epochDay - (getTodoIsoWeekday(stage.startsOn) - 1);
    const step = stage.rule.interval * 7;
    let latestEpochDay = start.epochDay;

    for (const weekday of stage.rule.weekdays) {
      let candidate = anchorMonday + weekday - 1;

      if (candidate <= start.epochDay) candidate += step;
      if (candidate <= through.epochDay) {
        candidate += Math.floor(
          (through.epochDay - candidate) / step,
        ) * step;
        latestEpochDay = Math.max(latestEpochDay, candidate);
      }
    }
    return formatTodoLocalDateEpochDay(latestEpochDay);
  }
  const startMonth = monthIndex(start.year, start.month);
  const throughMonth = monthIndex(through.year, through.month);
  let step = Math.floor(
    (throughMonth - startMonth) / stage.rule.interval,
  );

  while (step >= 0) {
    const candidate = dateInMonth(
      startMonth + step * stage.rule.interval,
      stage.rule.dayOfMonth,
    );

    if (
      compareTodoLocalDates(candidate, stage.startsOn) > 0 &&
      compareTodoLocalDates(candidate, end) <= 0
    ) {
      return candidate;
    }
    step -= 1;
  }
  return stage.startsOn;
}
