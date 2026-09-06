// SPDX-License-Identifier: GPL-3.0-or-later

import type { ApplicationScheduler } from "../../../application/runtime/index.ts";
import type { TodoLocalCalendar } from "../../../application/todo/index.ts";

export function createClientUuid() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("The client runtime cannot generate identifiers.");
  }
  return globalThis.crypto.randomUUID();
}

function clientLocalDate(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}` as
    ReturnType<TodoLocalCalendar["today"]>;
}

export const clientTodoLocalCalendar: TodoLocalCalendar = {
  subscribe(listener) {
    let disposed = false;
    let cancelTimer: (() => void) | null = null;
    let current = clientLocalDate();
    const schedule = () => {
      cancelTimer?.();
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      ).getTime();
      const timer = globalThis.setTimeout(() => {
        if (disposed) return;
        const next = clientLocalDate();

        if (next !== current) {
          current = next;
          listener();
        }
        schedule();
      }, Math.max(1, nextMidnight - now.getTime()));

      cancelTimer = () => globalThis.clearTimeout(timer);
    };

    schedule();
    return () => {
      disposed = true;
      cancelTimer?.();
    };
  },
  today: clientLocalDate,
};

export const clientApplicationScheduler: ApplicationScheduler = {
  now: () => globalThis.performance?.now() ?? Date.now(),
  schedule(callback, delayMs) {
    const timer = globalThis.setTimeout(callback, delayMs);

    return () => globalThis.clearTimeout(timer);
  },
};


export const clientClock = { now: () => new Date() };
