// SPDX-License-Identifier: GPL-3.0-or-later

export type CommandRuntime = {
  createId(): string;
  now(): Date;
};

export function readCommandRuntimeNow(runtime: Pick<CommandRuntime, "now">) {
  const date = runtime.now();

  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error("Command time source returned an invalid date.");
  }
  return { date, timestamp: date.toISOString() };
}
