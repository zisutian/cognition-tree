// SPDX-License-Identifier: GPL-3.0-or-later

import { createJournalParseIndex } from "../../../core/journal/indexes/journalParseIndex";
import { resolveJournalReferenceNavigation } from "../../../core/journal/queries/journalReferenceNavigation";
import { describe, expect, it } from "vitest";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  journalEntryId,
  updateJournalTestBody,
} from "../journalTestFixture";

describe("journal reference navigation", () => {
  it("opens global references inside the journal without exposing the fixed title", () => {
    let content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-17T12:00:00.000Z",
      entryIndex: 1,
    });
    content = appendJournalTestEntry(content, {
      blockIdStart: 2,
      createdAt: "2026-07-18T00:00:00.000Z",
      entryIndex: 2,
    });
    const index = createJournalParseIndex(content);

    expect(resolveJournalReferenceNavigation({
      activeEntryId: journalEntryId(2),
      index,
      target: { text: "2026-07-17-0001", type: "global-reference" },
    })).toEqual([{
      description: "创建 2026-07-17T12:00:00.000Z · 000001",
      entryId: journalEntryId(1),
      id: `journal-entry:${journalEntryId(1)}`,
      label: "2026-07-17-0001",
      lineNumber: 1,
    }]);
  });

  it("gives same-second entries independent daily sequence destinations", () => {
    let content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.100Z",
      entryIndex: 1,
    });
    content = appendJournalTestEntry(content, {
      blockIdStart: 2,
      createdAt: "2026-07-18T00:00:01.900Z",
      entryIndex: 2,
    });
    const index = createJournalParseIndex(content);
    const destinations = ["2026-07-18-0001", "2026-07-18-0002"].flatMap(
      (text) => resolveJournalReferenceNavigation({
        activeEntryId: journalEntryId(1),
        index,
        target: { text, type: "global-reference" },
      }),
    );

    expect(destinations.map(({ label }) => label)).toEqual([
      "2026-07-18-0001",
      "2026-07-18-0002",
    ]);
    expect(new Set(destinations.map(({ description }) => description)).size)
      .toBe(2);
    expect(destinations.map(({ description }) => description)).toEqual([
      "创建 2026-07-18T00:00:01.100Z · 000001",
      "创建 2026-07-18T00:00:01.900Z · 000002",
    ]);
  });

  it("resolves local references to body-editor line numbers", () => {
    let content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:00.000Z",
      entryIndex: 1,
    });
    content = updateJournalTestBody(content, {
      body: "概念\n\t- <概念>",
      entryIndex: 1,
      updatedAt: "2026-07-18T00:10:00.000Z",
    });
    const index = createJournalParseIndex(content);

    expect(resolveJournalReferenceNavigation({
      activeEntryId: journalEntryId(1),
      index,
      target: { text: "概念", type: "local-reference" },
    })).toEqual([{
      description: "L1 · 正文",
      entryId: journalEntryId(1),
      id: expect.stringContaining(`journal-block:${journalEntryId(1)}:`),
      label: "概念",
      lineNumber: 1,
    }]);
  });

  it("does not resolve unsupported or missing reference targets", () => {
    const content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:00.000Z",
      entryIndex: 1,
    });
    const index = createJournalParseIndex(content);

    expect(resolveJournalReferenceNavigation({
      activeEntryId: journalEntryId(1),
      index,
      target: { text: "missing", type: "global-reference" },
    })).toEqual([]);
    expect(resolveJournalReferenceNavigation({
      activeEntryId: journalEntryId(1),
      index,
      target: { text: "missing", type: "inline-code" },
    })).toEqual([]);
  });
});
