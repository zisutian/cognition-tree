// SPDX-License-Identifier: GPL-3.0-or-later

import {
  groupJournalEntriesByMonth,
  listJournalEntriesNewestFirst,
  resolveJournalSelection,
  resolveJournalSelectionAfterDelete,
} from "../../../core/journal/queries/journalQueries";
import { describe, expect, it } from "vitest";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  journalEntryId,
} from "../journalTestFixture";

describe("journal queries", () => {
  it("groups by the saved creation offset and sorts months and entries descending", () => {
    let content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-02-28T16:30:00.000Z",
      entryIndex: 1,
      timezoneOffsetMinutes: 480,
    });
    content = appendJournalTestEntry(content, {
      blockIdStart: 2,
      createdAt: "2026-03-31T16:20:00.000Z",
      entryIndex: 2,
      timezoneOffsetMinutes: 480,
    });
    content = appendJournalTestEntry(content, {
      blockIdStart: 3,
      createdAt: "2026-03-31T17:00:00.000Z",
      entryIndex: 3,
      timezoneOffsetMinutes: 480,
    });

    const groups = groupJournalEntriesByMonth(content);

    expect(groups.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: "2026-04", label: "2026 年 4 月" },
      { key: "2026-03", label: "2026 年 3 月" },
    ]);
    expect(groups[0]?.entries.map(({ id }) => id)).toEqual([
      journalEntryId(3),
      journalEntryId(2),
    ]);
  });

  it("uses append position as the stable tie-break for equal creation instants", () => {
    let content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    content = appendJournalTestEntry(content, {
      blockIdStart: 2,
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 2,
    });

    expect(listJournalEntriesNewestFirst(content).map(({ id }) => id)).toEqual([
      journalEntryId(2),
      journalEntryId(1),
    ]);
  });

  it("selects the newest entry and resolves the adjacent selection after deletion", () => {
    let content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    content = appendJournalTestEntry(content, {
      blockIdStart: 2,
      createdAt: "2026-07-18T00:00:02.000Z",
      entryIndex: 2,
    });
    content = appendJournalTestEntry(content, {
      blockIdStart: 3,
      createdAt: "2026-07-18T00:00:03.000Z",
      entryIndex: 3,
    });

    expect(resolveJournalSelection(content, null)).toBe(journalEntryId(3));
    expect(resolveJournalSelection(content, journalEntryId(1))).toBe(
      journalEntryId(1),
    );
    expect(resolveJournalSelectionAfterDelete(content, journalEntryId(2)))
      .toBe(journalEntryId(1));
    expect(resolveJournalSelectionAfterDelete(content, journalEntryId(1)))
      .toBe(journalEntryId(2));
    expect(resolveJournalSelectionAfterDelete(
      { ...content, entries: [content.entries[0]] },
      journalEntryId(1),
    )).toBeNull();
  });
});
