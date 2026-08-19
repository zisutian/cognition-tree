// SPDX-License-Identifier: GPL-3.0-or-later

import { JournalContentValidationError } from "./journalErrors.ts";
import type { JournalEntryId } from "./journalContent.ts";

export const journalMaximumDailySequence = 9_999;

const entryIdPattern =
  /^journal-entry-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const journalDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function assertJournalCanonicalTimestamp(
  value: string,
  label: string,
) {
  const milliseconds = Date.parse(value);

  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw new JournalContentValidationError(
      `${label} must be a canonical ISO timestamp.`,
    );
  }
}

export function assertJournalSequence(value: number, label: string) {
  if (
    !Number.isSafeInteger(value) || value < 1 ||
    value > journalMaximumDailySequence
  ) {
    throw new JournalContentValidationError(
      `${label} must be an integer between 1 and ${journalMaximumDailySequence}.`,
    );
  }
}

export function assertJournalDate(value: string, label: string) {
  if (
    !journalDatePattern.test(value) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new JournalContentValidationError(
      `${label} must be a canonical YYYY-MM-DD date.`,
    );
  }
}

export function isJournalEntryId(value: string): value is JournalEntryId {
  return entryIdPattern.test(value);
}

export function getJournalCreationTimezoneOffsetMinutes(date: Date) {
  return -date.getTimezoneOffset();
}

export function formatJournalEntryDate(
  createdAt: string,
  timezoneOffsetMinutes: number,
) {
  assertJournalCanonicalTimestamp(createdAt, "Journal entry createdAt");
  if (
    !Number.isSafeInteger(timezoneOffsetMinutes) ||
    timezoneOffsetMinutes < -840 ||
    timezoneOffsetMinutes > 840
  ) {
    throw new JournalContentValidationError(
      "Journal timezone offset must be an integer between -840 and 840 minutes.",
    );
  }

  const localTimestamp =
    Date.parse(createdAt) + timezoneOffsetMinutes * 60_000;

  return new Date(localTimestamp).toISOString().slice(0, 10);
}

export function formatJournalEntryTitle(
  createdAt: string,
  timezoneOffsetMinutes: number,
  sequence: number,
) {
  assertJournalSequence(sequence, "Journal entry sequence");
  return `${formatJournalEntryDate(createdAt, timezoneOffsetMinutes)}-${String(
    sequence,
  ).padStart(4, "0")}`;
}
