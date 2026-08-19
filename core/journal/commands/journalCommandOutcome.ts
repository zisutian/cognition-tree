// SPDX-License-Identifier: GPL-3.0-or-later

export type JournalCommandOutcome =
  | { kind: "ok" }
  | { entryId: string; kind: "journal-entry-created" };
