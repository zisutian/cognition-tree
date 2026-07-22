// SPDX-License-Identifier: GPL-3.0-or-later

import {
  formatJournalEntryTitle,
  listJournalEntries,
  type JournalContent,
  type JournalEntry,
  type JournalEntryId,
} from "../model/journalContent.ts";

export type JournalMonthGroup = {
  entries: JournalEntry[];
  key: string;
  label: string;
};

export type JournalCalendarMonth = {
  entries: JournalEntry[];
  key: string;
  label: string;
};

export type JournalCalendarYear = {
  key: string;
  label: string;
  months: JournalCalendarMonth[];
};

function compareEntryPositions(
  left: JournalEntry,
  right: JournalEntry,
) {
  const timeOrder = Date.parse(right.createdAt) - Date.parse(left.createdAt);

  return timeOrder || right.sequence - left.sequence ||
    right.id.localeCompare(left.id);
}
export function listJournalEntriesNewestFirst(content: JournalContent) {
  return listJournalEntries(content)
    .slice()
    .sort(compareEntryPositions);
}

export function createJournalCalendar(
  content: JournalContent,
): JournalCalendarYear[] {
  const yearByKey = new Map<string, Map<string, JournalEntry[]>>();

  for (const day of content.days) {
    if (day.entries.length === 0) continue;
    const [year, month] = day.date.split("-");
    const monthKey = `${year}-${month}`;
    const monthByKey = yearByKey.get(year) ?? new Map();
    const entries = monthByKey.get(monthKey) ?? [];

    entries.push(...day.entries);
    monthByKey.set(monthKey, entries);
    yearByKey.set(year, monthByKey);
  }

  return [...yearByKey.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([year, monthByKey]) => ({
      key: year,
      label: `${year} 年`,
      months: [...monthByKey.entries()]
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([key, entries]) => ({
          entries: entries.slice().sort(compareEntryPositions),
          key,
          label: `${Number(key.slice(5))} 月`,
        })),
    }));
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
    listJournalEntries(content).some(({ id }) => id === requestedEntryId)
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
