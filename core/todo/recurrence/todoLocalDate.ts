// SPDX-License-Identifier: GPL-3.0-or-later

import { DomainValidationError } from "../../errors/index.ts";

export type TodoLocalDate = `${number}-${number}-${number}`;
export type TodoIsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type TodoLocalDateParts = {
  day: number;
  epochDay: number;
  month: number;
  year: number;
};

const localDatePattern = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const millisecondsPerDay = 86_400_000;

export function getTodoGregorianEpochDay(
  year: number,
  month: number,
  day: number,
) {
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

export function parseTodoLocalDate(value: string): TodoLocalDateParts | null {
  const match = localDatePattern.exec(value);

  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1 || year > 9999) return null;
  const epochDay = getTodoGregorianEpochDay(year, month, day);

  return epochDay === null ? null : { day, epochDay, month, year };
}

export function formatTodoLocalDateEpochDay(
  epochDay: number,
): TodoLocalDate {
  const date = new Date(epochDay * millisecondsPerDay);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}` as TodoLocalDate;
}

export function getTodoGregorianDayOfMonth(epochDay: number) {
  return new Date(epochDay * millisecondsPerDay).getUTCDate();
}

export function isTodoLocalDate(value: string): value is TodoLocalDate {
  return parseTodoLocalDate(value) !== null;
}

export function requireTodoLocalDate(
  value: string,
  label = "Todo local date",
): TodoLocalDate {
  if (!isTodoLocalDate(value)) {
    throw new DomainValidationError(
      `${label} must use YYYY-MM-DD Gregorian format.`,
    );
  }
  return value;
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
    throw new DomainValidationError(
      "Todo local date offset must be an integer.",
    );
  }
  const parsed = parseTodoLocalDate(date);

  if (!parsed) {
    throw new DomainValidationError(`Invalid Todo local date: ${date}`);
  }
  return formatTodoLocalDateEpochDay(parsed.epochDay + days);
}

export function getTodoIsoWeekday(date: TodoLocalDate): TodoIsoWeekday {
  const parsed = parseTodoLocalDate(date);

  if (!parsed) {
    throw new DomainValidationError(`Invalid Todo local date: ${date}`);
  }
  const weekday = new Date(
    parsed.epochDay * millisecondsPerDay,
  ).getUTCDay();

  return (weekday === 0 ? 7 : weekday) as TodoIsoWeekday;
}
