// SPDX-License-Identifier: GPL-3.0-or-later

import {
  formatJournalEntryTitle,
  type JournalContent,
  type JournalEntry,
  type JournalEntryId,
} from "../model/journalContent.ts";

export type JournalMonthGroup = {
  entries: JournalEntry[];
  key: string;
  label: string;
};

function compareEntryPositions(
  left: { entry: JournalEntry; index: number },
  right: { entry: JournalEntry; index: number },
) {
  const timeOrder = Date.parse(right.entry.createdAt) -
    Date.parse(left.entry.createdAt);

  return timeOrder || right.index - left.index;
}
export function listJournalEntriesNewestFirst(content: JournalContent) {
  return content.entries
    .map((entry, index) => ({ entry, index }))
    .sort(compareEntryPositions)
    .map(({ entry }) => entry);
}

export function getJournalEntryMonthKey(entry: JournalEntry) {
  return formatJournalEntryTitle(
    entry.createdAt,
    entry.timezoneOffsetMinutes,
    entry.sequence,
  ).slice(0, 7);
}

export function groupJournalEntriesByMonth(
  content: JournalContent,
): JournalMonthGroup[] {
  const grouped = new Map<string, JournalEntry[]>();

  for (const entry of listJournalEntriesNewestFirst(content)) {
    const key = getJournalEntryMonthKey(entry);
    const entries = grouped.get(key);

    if (entries) {
      entries.push(entry);
    } else {
      grouped.set(key, [entry]);
    }
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, entries]) => {
      const [year, numericMonth] = key.split("-");

      return {
        entries,
        key,
        label: `${year} 年 ${Number(numericMonth)} 月`,
      };
    });
}

export function resolveJournalSelection(
  content: JournalContent,
  requestedEntryId: JournalEntryId | null,
) {
  if (
    requestedEntryId &&
    content.entries.some(({ id }) => id === requestedEntryId)
  ) {
    return requestedEntryId;
  }
  return listJournalEntriesNewestFirst(content)[0]?.id ?? null;
}

export function resolveJournalSelectionAfterDelete(
  content: JournalContent,
  deletedEntryId: JournalEntryId,
) {
  const entries = listJournalEntriesNewestFirst(content);
  const deletedIndex = entries.findIndex(({ id }) => id === deletedEntryId);

  if (deletedIndex < 0) {
    throw new Error(`Journal entry does not exist: ${deletedEntryId}`);
  }

  return entries[deletedIndex + 1]?.id ??
    entries[deletedIndex - 1]?.id ??
    null;
}
