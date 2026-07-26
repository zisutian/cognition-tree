// SPDX-License-Identifier: GPL-3.0-or-later

import { createMyersTextEdits } from "../../../core/ctn/metadata/myersTextEdits";
import {
  readCtnCanonicalTitleHeader,
} from "../../../core/ctn/parser/parseCtnDocument";
import {
  readCanonicalTestDocument,
} from "../../ctn/analysis/analysisTestHelpers";
import {
  createJournalEntry,
  deleteJournalEntry,
  updateJournalEntryBody,
  updateJournalSyntaxSource,
} from "../../../core/journal/commands/journalCommands";
import { validateJournalContent } from "../../../core/journal/model/journalContent";
import { requireCtnSyntax } from "../../../core/ctn/syntax/compiler";
import {
  createJournalParseIndex,
} from "../../../core/journal/indexes/journalParseIndex";
import { describe, expect, it } from "vitest";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  journalBlockId,
  journalEntries,
  journalEntryId,
  updateJournalTestBody,
} from "../journalTestFixture";

describe("journal commands", () => {
  it("issues stable daily sequence titles without reusing a timestamp title", () => {
    const first = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.100Z",
      entryIndex: 1,
    });
    const second = createJournalEntry(
      first,
      createJournalParseIndex(first),
      {
        createBlockId: () => journalBlockId(2),
        createdAt: "2026-07-18T00:00:01.900Z",
        entryId: journalEntryId(2),
        timezoneOffsetMinutes: 480,
      },
    ).content;

    expect(journalEntries(second)).toHaveLength(2);
    expect(journalEntries(second).map(({ source }) =>
      readCtnCanonicalTitleHeader(source).title
    )).toEqual([
      "2026-07-18-0001",
      "2026-07-18-0002",
    ]);
    expect(second.days).toEqual([expect.objectContaining({
      date: "2026-07-18",
      lastIssuedSequence: 2,
    })]);
    validateJournalContent(second);
  });

  it("updates only the body and leaves the canonical title block immutable", () => {
    const content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const beforeHeader = readCtnCanonicalTitleHeader(
      journalEntries(content)[0].source,
    );
    const updated = updateJournalTestBody(content, {
      body: "今日\n\t- 完成正文",
      entryIndex: 1,
      updatedAt: "2026-07-18T01:00:00.000Z",
    });
    const entry = journalEntries(updated)[0];
    const afterHeader = readCtnCanonicalTitleHeader(entry.source);
    const document = readCanonicalTestDocument(
      entry.source,
      requireCtnSyntax(updated.syntaxSource, "journal"),
    );

    expect(afterHeader).toEqual(beforeHeader);
    expect(entry.updatedAt).toBe("2026-07-18T01:00:00.000Z");
    expect(document.blocks.map(({ text }) => text)).toEqual([
      "2026-07-18-0001",
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
    const before = readCanonicalTestDocument(
      journalEntries(first)[0].source,
      requireCtnSyntax(first.syntaxSource, "journal"),
    );
    const secondBody = "- alpha changed\n- beta";
    const second = updateJournalEntryBody(
      first,
      createJournalParseIndex(first),
      {
      change: {
        edits: createMyersTextEdits(firstBody, secondBody),
        source: secondBody,
      },
      createBlockId: () => journalBlockId(999),
      entryId: journalEntryId(1),
      updatedAt: "2026-07-18T00:20:00.000Z",
      },
    ).content;
    const after = readCanonicalTestDocument(
      journalEntries(second)[0].source,
      requireCtnSyntax(second.syntaxSource, "journal"),
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
    const before = readCanonicalTestDocument(
      journalEntries(first)[0].source,
      requireCtnSyntax(first.syntaxSource, "journal"),
    );
    const second = updateJournalEntryBody(
      first,
      createJournalParseIndex(first),
      {
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
      },
    ).content;
    const after = readCanonicalTestDocument(
      journalEntries(second)[0].source,
      requireCtnSyntax(second.syntaxSource, "journal"),
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

    expect(updateJournalEntryBody(
      content,
      createJournalParseIndex(content),
      {
      change: { edits: [], source: "" },
      createBlockId: () => journalBlockId(2),
      entryId: journalEntryId(1),
      updatedAt: "2026-07-18T00:10:00.000Z",
      },
    ).content).toBe(content);
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

    expect(journalEntries(deleteJournalEntry(second, journalEntryId(1))).map(
      ({ id }) => id,
    )).toEqual([journalEntryId(2)]);
    expect(() => deleteJournalEntry(second, journalEntryId(9))).toThrow(
      /does not exist/,
    );
  });

  it("never reuses a deleted sequence and rejects the 10000th daily entry", () => {
    const created = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const deleted = deleteJournalEntry(created, journalEntryId(1));

    expect(deleted.days).toEqual([{
      date: "2026-07-18",
      entries: [],
      lastIssuedSequence: 1,
    }]);
    const recreated = createJournalEntry(
      deleted,
      createJournalParseIndex(deleted),
      {
        createBlockId: () => journalBlockId(2),
        createdAt: "2026-07-18T00:00:02.000Z",
        entryId: journalEntryId(2),
        timezoneOffsetMinutes: 480,
      },
    ).content;

    expect(readCtnCanonicalTitleHeader(journalEntries(recreated)[0].source).title)
      .toBe("2026-07-18-0002");
    const atLimit = {
      ...recreated,
      days: recreated.days.map((day) => ({
        ...day,
        lastIssuedSequence: 9_999,
      })),
    };

    expect(() => createJournalEntry(
      atLimit,
      createJournalParseIndex(atLimit),
      {
        createBlockId: () => journalBlockId(3),
        createdAt: "2026-07-18T00:00:03.000Z",
        entryId: journalEntryId(3),
        timezoneOffsetMinutes: 480,
      },
    )).toThrow(/daily limit/);
  });

  it("persists valid Journal syntax edits and rejects protected rule changes", () => {
    const content = createEmptyJournalContent();
    const updated = updateJournalSyntaxSource(
      content,
      createJournalParseIndex(content),
      {
        createBlockId: () => journalBlockId(1),
        source: content.syntaxSource.replace(
          'label = "正文"',
          'label = "日记正文"',
        ),
        updatedAt: "2026-07-18T00:00:00.000Z",
      },
    ).content;

    expect(updated.syntaxSource).toContain('label = "日记正文"');
    expect(() => updateJournalSyntaxSource(
      updated,
      createJournalParseIndex(updated),
      {
        createBlockId: () => journalBlockId(1),
        source: updated.syntaxSource.replace('open = "[["', 'open = "{{"'),
        updatedAt: "2026-07-18T00:00:00.000Z",
      },
    )).toThrow(/\[\[\.\.\.\]/);
  });
});
