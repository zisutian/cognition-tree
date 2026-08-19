// SPDX-License-Identifier: GPL-3.0-or-later

import { createJournalParseIndex } from "../../../../core/journal/indexes/journalParseIndex";
import { describe, expect, it } from "vitest";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  journalEntryId,
  journalEntries,
  replaceJournalTestEntries,
  updateJournalTestBody,
} from "../journalTestFixture";

describe("journal parse index", () => {
  it("resolves global references only against journal entry titles", () => {
    let content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-17T12:00:00.000Z",
      entryIndex: 1,
      timezoneOffsetMinutes: 480,
    });
    content = appendJournalTestEntry(content, {
      blockIdStart: 2,
      createdAt: "2026-07-18T00:00:00.000Z",
      entryIndex: 2,
      timezoneOffsetMinutes: 480,
    });
    content = updateJournalTestBody(content, {
      body: "- [[2026-07-17-0001]]\n- [[普通仓库同名笔记]]",
      entryIndex: 2,
      updatedAt: "2026-07-18T00:10:00.000Z",
    });

    const index = createJournalParseIndex(content);

    expect(index.referenceGraph.edges).toEqual([
      expect.objectContaining({
        count: 1,
        sourceEntryId: journalEntryId(2),
        targetEntryId: journalEntryId(1),
      }),
    ]);
    expect(index.referenceGraph.unresolvedReferences).toEqual([
      expect.objectContaining({
        sourceEntryId: journalEntryId(2),
        targetText: "普通仓库同名笔记",
      }),
    ]);
  });

  it("separates qualified workspace references from journal references", () => {
    let content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.100Z",
      entryIndex: 1,
    });
    content = appendJournalTestEntry(content, {
      blockIdStart: 2,
      createdAt: "2026-07-18T00:00:01.900Z",
      entryIndex: 2,
    });
    content = appendJournalTestEntry(content, {
      blockIdStart: 3,
      createdAt: "2026-07-18T00:00:03.000Z",
      entryIndex: 3,
    });
    content = updateJournalTestBody(content, {
      body: "- [[知识库:主题笔记]]",
      entryIndex: 3,
      updatedAt: "2026-07-18T00:10:00.000Z",
    });

    const graph = createJournalParseIndex(content).referenceGraph;

    expect(graph.edges).toEqual([]);
    expect(graph.ambiguousReferences).toEqual([]);
    expect(graph.workspaceReferences).toEqual([
      expect.objectContaining({
        noteName: "主题笔记",
        repositoryName: "知识库",
        sourceEntryId: journalEntryId(3),
      }),
    ]);
  });

  it("reuses unchanged parsed documents without retaining deleted entries", () => {
    let content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    content = appendJournalTestEntry(content, {
      blockIdStart: 2,
      createdAt: "2026-07-18T00:00:02.000Z",
      entryIndex: 2,
    });
    const first = createJournalParseIndex(content);
    const nextContent = replaceJournalTestEntries(
      content,
      [journalEntries(content)[1]],
    );
    const second = createJournalParseIndex(nextContent, first);

    expect(first.analysisStats).toEqual({
      analyzedEntryIds: [journalEntryId(1), journalEntryId(2)],
      runCount: 2,
      updatedBlockIdOwnerIds: [journalEntryId(1), journalEntryId(2)],
    });
    expect(second.analysisStats).toEqual({
      analyzedEntryIds: [],
      runCount: 0,
      updatedBlockIdOwnerIds: [journalEntryId(1)],
    });
    expect(second.getParsedEntry(journalEntryId(2))?.analysis.document).toBe(
      first.getParsedEntry(journalEntryId(2))?.analysis.document,
    );
    expect(
      second.blockIdRegistry.blockIdsByOwner.get(journalEntryId(2)),
    ).toBe(first.blockIdRegistry.blockIdsByOwner.get(journalEntryId(2)));
    expect(second.getParsedEntry(journalEntryId(1))).toBeNull();
    expect(second.parseCache.has(journalEntryId(1))).toBe(false);
  });
});
