// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import type { TodoLocalDate } from "../../../../core/todo/recurrence/todoLocalDate.ts";

export type ApiRuntime = {
  createId(): string;
  now(): Date;
  timezoneOffsetMinutes(date: Date): number;
  today(date: Date): TodoLocalDate;
};

function localDate(date: Date): TodoLocalDate {
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");

  return `${year}-${month}-${day}` as TodoLocalDate;
}

export const systemApiRuntime: ApiRuntime = {
  createId: randomUUID,
  now: () => new Date(),
  timezoneOffsetMinutes: (date) => -date.getTimezoneOffset(),
  today: localDate,
};

export function readApiRuntimeNow(runtime: ApiRuntime) {
  const date = runtime.now();

  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error("API time source returned an invalid date.");
  }
  return {
    date,
    timestamp: date.toISOString(),
    today: runtime.today(date),
  };
}
