// SPDX-License-Identifier: GPL-3.0-or-later

import { createMyersTextEdits } from "../../../ctn/metadata/myersTextEdits";
import {
  parseCtnCanonicalDocument,
  readCtnCanonicalTitleHeader,
} from "../../../ctn/parser/parseCtnDocument";
import {
  createJournalEntry,
  deleteJournalEntry,
  updateJournalEntryBody,
} from "../../../journal/commands/journalCommands";
import { validateJournalContent } from "../../../journal/model/journalContent";
import { journalCtnSyntaxProfileV1 } from "../../../journal/syntax/journalSyntaxV1";
import { describe, expect, it } from "vitest";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  journalBlockId,
  journalEntryId,
  updateJournalTestBody,
} from "../journalTestFixture";

describe("journal commands", () => {
  it("allows multiple manually created entries with the same derived title", () => {
    const first = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.100Z",
      entryIndex: 1,
    });
    const second = createJournalEntry(first, {
      createBlockId: () => journalBlockId(2),
      createdAt: "2026-07-18T00:00:01.900Z",
      entryId: journalEntryId(2),
      timezoneOffsetMinutes: 480,
    }).content;

    expect(second.entries).toHaveLength(2);
    expect(second.entries.map(({ source }) =>
      readCtnCanonicalTitleHeader(source).title
    )).toEqual([
      "2026-07-18 08:00:01",
      "2026-07-18 08:00:01",
    ]);
    validateJournalContent(second);
  });

  it("updates only the body and leaves the canonical title block immutable", () => {
    const content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const beforeHeader = readCtnCanonicalTitleHeader(content.entries[0].source);
    const updated = updateJournalTestBody(content, {
      body: "今日\n\t- 完成正文",
      entryIndex: 1,
      updatedAt: "2026-07-18T01:00:00.000Z",
    });
    const entry = updated.entries[0];
    const afterHeader = readCtnCanonicalTitleHeader(entry.source);
    const document = parseCtnCanonicalDocument(
      entry.source,
      journalCtnSyntaxProfileV1,
    );

    expect(afterHeader).toEqual(beforeHeader);
    expect(entry.updatedAt).toBe("2026-07-18T01:00:00.000Z");
    expect(document.blocks.map(({ text }) => text)).toEqual([
      "2026-07-18 08:00:01",
      "今日",
      "完成正文",
    ]);
    expect(document.blocks.slice(1).map(({ metadata }) => metadata.updatedAt))
      .toEqual([
        "2026-07-18T01:00:00.000Z",
        "2026-07-18T01:00:00.000Z",
      ]);
  });

  it("preserves untouched body block identity and timestamps", () => {
    const created = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const firstBody = "- alpha\n- beta";
    const first = updateJournalTestBody(created, {
      body: firstBody,
      entryIndex: 1,
      updatedAt: "2026-07-18T00:10:00.000Z",
    });
    const before = parseCtnCanonicalDocument(
      first.entries[0].source,
      journalCtnSyntaxProfileV1,
    );
    const secondBody = "- alpha changed\n- beta";
    const second = updateJournalEntryBody(first, {
      change: {
        edits: createMyersTextEdits(firstBody, secondBody),
        source: secondBody,
      },
      createBlockId: () => journalBlockId(999),
      entryId: journalEntryId(1),
      updatedAt: "2026-07-18T00:20:00.000Z",
    });
    const after = parseCtnCanonicalDocument(
      second.entries[0].source,
      journalCtnSyntaxProfileV1,
    );

    expect(after.blocks[2]?.id).toBe(before.blocks[2]?.id);
    expect(after.blocks[2]?.metadata.updatedAt).toBe(
      before.blocks[2]?.metadata.updatedAt,
    );
    expect(after.blocks[1]?.metadata.updatedAt).toBe(
      "2026-07-18T00:20:00.000Z",
    );
  });

  it("preserves the surviving duplicate block selected by the exact body edit", () => {
    const created = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const repeatedLine = "- duplicate";
    const firstBody = `${repeatedLine}\n${repeatedLine}`;
    const first = updateJournalTestBody(created, {
      body: firstBody,
      entryIndex: 1,
      updatedAt: "2026-07-18T00:10:00.000Z",
    });
    const before = parseCtnCanonicalDocument(
      first.entries[0].source,
      journalCtnSyntaxProfileV1,
    );
    const second = updateJournalEntryBody(first, {
      change: {
        edits: [{
          from: 0,
          insertedText: "",
          to: repeatedLine.length + 1,
        }],
        source: repeatedLine,
      },
      createBlockId: () => journalBlockId(999),
      entryId: journalEntryId(1),
      updatedAt: "2026-07-18T00:20:00.000Z",
    });
    const after = parseCtnCanonicalDocument(
      second.entries[0].source,
      journalCtnSyntaxProfileV1,
    );

    expect(after.blocks[1]?.id).toBe(before.blocks[2]?.id);
    expect(after.blocks[1]?.metadata.updatedAt).toBe(
      "2026-07-18T00:20:00.000Z",
    );
  });

  it("returns the same content for a no-op body update", () => {
    const content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });

    expect(updateJournalEntryBody(content, {
      change: { edits: [], source: "" },
      createBlockId: () => journalBlockId(2),
      entryId: journalEntryId(1),
      updatedAt: "2026-07-18T00:10:00.000Z",
    })).toBe(content);
  });

  it("deletes only the requested entry and rejects missing entries", () => {
    const first = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const second = appendJournalTestEntry(first, {
      blockIdStart: 2,
      createdAt: "2026-07-18T00:00:02.000Z",
      entryIndex: 2,
    });

    expect(deleteJournalEntry(second, journalEntryId(1)).entries.map(
      ({ id }) => id,
    )).toEqual([journalEntryId(2)]);
    expect(() => deleteJournalEntry(second, journalEntryId(9))).toThrow(
      /does not exist/,
    );
  });
});
