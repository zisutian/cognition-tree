// SPDX-License-Identifier: GPL-3.0-or-later

export type TodoLocalDate = `${number}-${number}-${number}`;
export type TodoIsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

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

export type TodoRecurrenceProjection = {
  active: boolean;
  completed: boolean;
  completedAt: string | null;
  completedCount: number;
  currentOccurrenceDate: TodoLocalDate | null;
  currentStage: TodoRecurrenceStage | null;
  nextOccurrenceDate: TodoLocalDate | null;
  totalCount: number;
};

const localDatePattern = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const stageIdPattern =
  /^todo-recurrence-stage-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const millisecondsPerDay = 86_400_000;

function toEpochDayParts(year: number, month: number, day: number) {
  const date = new Date(0);

  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(date.getTime() / millisecondsPerDay);
}

function readLocalDate(value: string) {
  const match = localDatePattern.exec(value);

  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1 || year > 9999) return null;
  const epochDay = toEpochDayParts(year, month, day);

  return epochDay === null ? null : { day, epochDay, month, year };
}

function formatEpochDay(epochDay: number): TodoLocalDate {
  const date = new Date(epochDay * millisecondsPerDay);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}` as TodoLocalDate;
}

function requirePositiveInterval(interval: number) {
  if (!Number.isSafeInteger(interval) || interval < 1) {
    throw new Error("Todo recurrence interval must be a positive integer.");
  }
}

export function isTodoLocalDate(value: string): value is TodoLocalDate {
  return readLocalDate(value) !== null;
}

export function requireTodoLocalDate(
  value: string,
  label = "Todo local date",
): TodoLocalDate {
  if (!isTodoLocalDate(value)) {
    throw new Error(`${label} must use YYYY-MM-DD Gregorian format.`);
  }
  return value;
}

export function isTodoRecurrenceStageId(
  value: string,
): value is TodoRecurrenceStageId {
  return stageIdPattern.test(value);
}

export function isTodoRecurrenceEnabled(recurrence: TodoRecurrence) {
  return recurrence.stages.at(-1)?.endsBefore === null;
}

export function compareTodoLocalDates(
  left: TodoLocalDate,
  right: TodoLocalDate,
) {
  return left.localeCompare(right);
}

export function addTodoLocalDays(
  date: TodoLocalDate,
  days: number,
): TodoLocalDate {
  if (!Number.isSafeInteger(days)) {
    throw new Error("Todo local date offset must be an integer.");
  }
  const parsed = readLocalDate(date);

  if (!parsed) throw new Error(`Invalid Todo local date: ${date}`);
  return formatEpochDay(parsed.epochDay + days);
}

export function getTodoIsoWeekday(date: TodoLocalDate): TodoIsoWeekday {
  const parsed = readLocalDate(date);

  if (!parsed) throw new Error(`Invalid Todo local date: ${date}`);
  const weekday = new Date(
    parsed.epochDay * millisecondsPerDay,
  ).getUTCDay();

  return (weekday === 0 ? 7 : weekday) as TodoIsoWeekday;
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
      throw new Error("Todo monthly recurrence day must be between 1 and 31.");
    }
    return rule;
  }
  if (rule.weekdays.length === 0) {
    throw new Error("Todo weekly recurrence requires at least one weekday.");
  }
  let previous = 0;

  for (const weekday of rule.weekdays) {
    if (
      !Number.isSafeInteger(weekday) ||
      weekday < 1 ||
      weekday > 7 ||
      weekday <= previous
    ) {
      throw new Error(
        "Todo weekly recurrence weekdays must be unique and ascending.",
      );
    }
    previous = weekday;
  }
  return rule;
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
  const nextMonthEpoch = toEpochDayParts(
    month === 12 ? year + 1 : year,
    month === 12 ? 1 : month + 1,
    1,
  );

  if (nextMonthEpoch === null) {
    throw new Error("Todo recurrence month is outside the supported range.");
  }
  const lastDay = new Date(
    (nextMonthEpoch - 1) * millisecondsPerDay,
  ).getUTCDate();
  const epochDay = toEpochDayParts(year, month, Math.min(dayOfMonth, lastDay));

  if (epochDay === null) {
    throw new Error("Todo recurrence month is outside the supported range.");
  }
  return formatEpochDay(epochDay);
}

function dailyCount(
  stage: TodoRecurrenceStage,
  lastDate: TodoLocalDate,
) {
  const start = readLocalDate(stage.startsOn)!;
  const end = readLocalDate(lastDate)!;
  const rule = stage.rule as TodoDailyRecurrenceRule;

  return Math.floor((end.epochDay - start.epochDay) / rule.interval) + 1;
}

function weeklyCount(
  stage: TodoRecurrenceStage,
  lastDate: TodoLocalDate,
) {
  const start = readLocalDate(stage.startsOn)!;
  const end = readLocalDate(lastDate)!;
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
  const start = readLocalDate(stage.startsOn)!;
  const end = readLocalDate(lastDate)!;
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
  const start = readLocalDate(stage.startsOn)!;
  const after = readLocalDate(afterDate)!;
  const rule = stage.rule as TodoDailyRecurrenceRule;
  const offset = after.epochDay < start.epochDay
    ? 0
    : Math.floor((after.epochDay - start.epochDay) / rule.interval) + 1;

  return formatEpochDay(start.epochDay + offset * rule.interval);
}

function nextWeeklyOccurrence(
  stage: TodoRecurrenceStage,
  afterDate: TodoLocalDate,
) {
  if (compareTodoLocalDates(afterDate, stage.startsOn) < 0) {
    return stage.startsOn;
  }
  const start = readLocalDate(stage.startsOn)!;
  const after = readLocalDate(afterDate)!;
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
  return formatEpochDay(nextEpochDay);
}

function nextMonthlyOccurrence(
  stage: TodoRecurrenceStage,
  afterDate: TodoLocalDate,
) {
  if (compareTodoLocalDates(afterDate, stage.startsOn) < 0) {
    return stage.startsOn;
  }
  const start = readLocalDate(stage.startsOn)!;
  const after = readLocalDate(afterDate)!;
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

function currentStage(
  recurrence: TodoRecurrence,
  today: TodoLocalDate,
) {
  return [...recurrence.stages].reverse().find((stage) =>
    compareTodoLocalDates(stage.startsOn, today) <= 0 &&
    (!stage.endsBefore ||
      compareTodoLocalDates(today, stage.endsBefore) < 0)
  ) ?? null;
}

function latestOccurrenceOnOrBefore(
  stage: TodoRecurrenceStage,
  date: TodoLocalDate,
) {
  if (compareTodoLocalDates(date, stage.startsOn) < 0) return null;
  const end = stageLastDate(stage, date);

  if (!end) return null;
  const start = readLocalDate(stage.startsOn)!;
  const through = readLocalDate(end)!;
  if (stage.rule.kind === "daily") {
    const offset = Math.floor(
      (through.epochDay - start.epochDay) / stage.rule.interval,
    );

    return formatEpochDay(start.epochDay + offset * stage.rule.interval);
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
    return formatEpochDay(latestEpochDay);
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

export function projectTodoRecurrence(
  recurrence: TodoRecurrence,
  today: TodoLocalDate,
): TodoRecurrenceProjection {
  requireTodoLocalDate(today);
  const active = isTodoRecurrenceEnabled(recurrence);
  const stage = active ? currentStage(recurrence, today) : null;
  const currentOccurrenceDate = stage
    ? latestOccurrenceOnOrBefore(stage, today)
    : null;
  const completion = currentOccurrenceDate && stage
    ? recurrence.completions.find((candidate) =>
        candidate.stageId === stage.id &&
        candidate.occurrenceDate === currentOccurrenceDate
      ) ?? null
    : null;

  return {
    active,
    completed: completion !== null,
    completedAt: completion?.completedAt ?? null,
    completedCount: recurrence.completions.length,
    currentOccurrenceDate,
    currentStage: stage,
    nextOccurrenceDate: stage
      ? getNextTodoRecurrenceStageOccurrence(stage, today)
      : null,
    totalCount: recurrence.stages.reduce(
      (count, candidate) =>
        count + countTodoRecurrenceStageOccurrences(candidate, today),
      0,
    ),
  };
}
