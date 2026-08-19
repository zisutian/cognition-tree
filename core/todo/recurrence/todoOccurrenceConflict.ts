// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoLocalDate } from "./todoLocalDate.ts";

export class TodoOccurrenceConflictError extends Error {
  readonly currentOccurrenceDate: TodoLocalDate | null;

  constructor(currentOccurrenceDate: TodoLocalDate | null) {
    super("Todo recurrence occurrence is no longer current.");
    this.name = "TodoOccurrenceConflictError";
    this.currentOccurrenceDate = currentOccurrenceDate;
  }
}
