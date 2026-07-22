// SPDX-License-Identifier: GPL-3.0-or-later

import { createJournalParseIndex } from "../../../core/journal/indexes/journalParseIndex";
import { createJournalViewModel } from "../../../application/journal/journalViewModel";
import { describe, expect, it, vi } from "vitest";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  journalEntryId,
  updateJournalTestBody,
} from "../../journal/journalTestFixture";

function createViewContent() {
  let content = appendJournalTestEntry(createEmptyJournalContent(), {
    createdAt: "2026-07-17T12:00:00.000Z",
    entryIndex: 1,
  });
  content = appendJournalTestEntry(content, {
    blockIdStart: 2,
    createdAt: "2026-07-18T00:00:00.000Z",
    entryIndex: 2,
  });
  return updateJournalTestBody(content, {
    body: "正文\n\t- 子项 [[2026-07-17-0001]]",
    createBlockIdStart: 10,
    entryIndex: 2,
    updatedAt: "2026-07-18T00:10:00.000Z",
  });
}

describe("journal view model", () => {
  it("projects grouped entries, body-only editor state and structure details", () => {
    const content = createViewContent();
    const openEntryLine = vi.fn();
    const updateEntryBody = vi.fn();
    const view = createJournalViewModel({
      activeBodyPosition: { entryId: journalEntryId(2), lineNumber: 2 },
      activeEntryId: journalEntryId(2),
      consumeFocusRequest: vi.fn(),
      content,
      createEntry: () => journalEntryId(9),
      deleteEntry: vi.fn(),
      expandedCalendarKeys: new Set([
        "year:2026",
        "month:2026-07",
      ]),
      focusRequest: {
        entryId: journalEntryId(2),
        lineNumber: 2,
        requestId: 4,
      },
      index: createJournalParseIndex(content),
      openEntryLine,
      persistence: { status: "saved" },
      selectEntry: vi.fn(),
      toggleCalendarKey: vi.fn(),
      updateActiveBodyLine: vi.fn(),
      updateEntryBody,
    });

    expect(view.calendar.years).toHaveLength(1);
    expect(view.calendar.years[0]?.months[0]?.entries.map(
      ({ id, isActive }) => ({ id, isActive }),
    )).toEqual([
      { id: journalEntryId(2), isActive: true },
      { id: journalEntryId(1), isActive: false },
    ]);
    expect(view.activeEntry).toMatchObject({
      id: journalEntryId(2),
      title: "2026-07-18-0001",
    });
    expect(view.editor.documentText).toBe(
      "正文\n\t- 子项 [[2026-07-17-0001]]",
    );
    expect(view.editor.contentMode).toEqual({
      kind: "body",
      title: "2026-07-18-0001",
    });
    expect(view.editor.documentText).not.toContain("2026-07-18-0001");
    expect(view.editor.focusTarget).toEqual({
      lineNumber: 2,
      requestId: 4,
    });
    expect(view.editor.stats).toEqual({
      lineCount: 2,
      rootCount: 1,
      totalBlocks: 2,
    });
    expect(view.outline.nodes).toEqual([
      expect.objectContaining({
        children: [
          expect.objectContaining({
            lineLabel: "L2",
            lineNumber: 2,
          }),
        ],
        lineLabel: "L1-2",
        lineNumber: 1,
      }),
    ]);
    expect(view.outline.activeBlock).toMatchObject({ lineNumber: 2 });

    view.outline.onSelectLine(1);
    expect(openEntryLine).toHaveBeenCalledWith(journalEntryId(2), 1);

    const change = {
      edits: [{ from: 0, insertedText: "更新", to: 2 }],
      source: "更新\n\t- 子项 [[2026-07-17-0001]]",
    };
    view.editor.updateBody(change);
    expect(updateEntryBody).toHaveBeenCalledWith(journalEntryId(2), change);
  });

  it("resolves references only inside the journal and opens body lines", () => {
    const content = createViewContent();
    const openEntryLine = vi.fn();
    const view = createJournalViewModel({
      activeBodyPosition: null,
      activeEntryId: journalEntryId(2),
      consumeFocusRequest: vi.fn(),
      content,
      createEntry: () => journalEntryId(9),
      deleteEntry: vi.fn(),
      expandedCalendarKeys: new Set(),
      focusRequest: null,
      index: createJournalParseIndex(content),
      openEntryLine,
      persistence: { status: "saved" },
      selectEntry: vi.fn(),
      toggleCalendarKey: vi.fn(),
      updateActiveBodyLine: vi.fn(),
      updateEntryBody: vi.fn(),
    });

    const destinations = view.referenceNavigation.resolve({
      text: "2026-07-17-0001",
      type: "global-reference",
    });

    expect(destinations).toEqual([{
      description: "创建 2026-07-17T12:00:00.000Z · 000001",
      entryId: journalEntryId(1),
      id: `journal-entry:${journalEntryId(1)}`,
      label: "2026-07-17-0001",
      lineNumber: 1,
    }]);
    view.referenceNavigation.navigate(destinations[0]);
    expect(openEntryLine).toHaveBeenCalledWith(journalEntryId(1), 1);
    expect(view.diagnostics.diagnostics).toEqual([]);
  });

  it("projects an empty repository without inventing an active entry", () => {
    const content = createEmptyJournalContent();
    const view = createJournalViewModel({
      activeBodyPosition: null,
      activeEntryId: null,
      consumeFocusRequest: vi.fn(),
      content,
      createEntry: () => journalEntryId(1),
      deleteEntry: vi.fn(),
      expandedCalendarKeys: new Set(),
      focusRequest: null,
      index: createJournalParseIndex(content),
      openEntryLine: vi.fn(),
      persistence: { status: "saved" },
      selectEntry: vi.fn(),
      toggleCalendarKey: vi.fn(),
      updateActiveBodyLine: vi.fn(),
      updateEntryBody: vi.fn(),
    });

    expect(view.activeEntry).toBeNull();
    expect(view.calendar.years).toEqual([]);
    expect(view.outline.nodes).toEqual([]);
    expect(view.editor.documentText).toBe("");
    expect(view.editor.stats).toEqual({
      lineCount: 1,
      rootCount: 0,
      totalBlocks: 0,
    });
  });
});
