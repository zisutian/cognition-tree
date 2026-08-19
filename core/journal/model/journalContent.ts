// SPDX-License-Identifier: GPL-3.0-or-later

import {
  defaultJournalSyntaxSource,
} from "../syntax/defaultJournalSyntax.ts";

export const journalRepositorySchemaVersion = 3 as const;

export type JournalEntryId = `journal-entry-${string}`;

export type JournalDay = {
  date: string;
  entries: JournalEntry[];
  lastIssuedSequence: number;
};

export type JournalEntry = {
  id: JournalEntryId;
  createdAt: string;
  sequence: number;
  timezoneOffsetMinutes: number;
  updatedAt: string;
  source: string;
};

/** Shape accepted after the runtime-neutral system wire parser has run. */
export type JournalEntryValue = Omit<JournalEntry, "id"> & { id: string };

export type JournalContent = {
  schemaVersion: typeof journalRepositorySchemaVersion;
  syntaxSource: string;
  days: JournalDay[];
};

export type JournalDayValue = Omit<JournalDay, "entries"> & {
  entries: JournalEntryValue[];
};

export type JournalContentValue = Omit<JournalContent, "days"> & {
  days: JournalDayValue[];
};

export function listJournalEntries(content: JournalContent): JournalEntry[];
export function listJournalEntries(
  content: JournalContentValue,
): JournalEntryValue[];
export function listJournalEntries(content: JournalContentValue) {
  return content.days.flatMap((day) => day.entries);
}

export function findJournalEntry(
  content: JournalContent,
  entryId: JournalEntryId,
): JournalEntry | null;
export function findJournalEntry(
  content: JournalContentValue,
  entryId: JournalEntryId,
): JournalEntryValue | null;
export function findJournalEntry(
  content: JournalContentValue,
  entryId: JournalEntryId,
) {
  for (const day of content.days) {
    const entry = day.entries.find(({ id }) => id === entryId);

    if (entry) return entry;
  }
  return null;
}

export function createEmptyJournalContent(): JournalContent {
  return {
    days: [],
    schemaVersion: journalRepositorySchemaVersion,
    syntaxSource: defaultJournalSyntaxSource,
  };
}
