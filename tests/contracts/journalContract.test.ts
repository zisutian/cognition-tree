// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  UnsupportedWireVersionError,
  WireContractError,
} from "../../contracts/common/contractValue.ts";
import { defaultJournalSyntaxSourceV3 as contractSyntax } from "../../contracts/journal/defaultContent.ts";
import {
  createEmptyJournalContent,
  isJournalEntryId,
  parseJournalCommit,
  parseJournalContent,
  parseJournalSnapshot,
} from "../../contracts/journal/parseJournal.ts";
import { serializeJournalRevisionContent } from "../../contracts/journal/revision.ts";
import type { JournalContentDto } from "../../contracts/journal/types.ts";
import { defaultJournalSyntaxSourceV3 as domainSyntax } from "../../core/journal/syntax/journalSyntax.ts";

const revision = `sha256:${"a".repeat(64)}` as const;
const entryId = "journal-entry-00000000-0000-4000-8000-000000000001";

function journalContent(): JournalContentDto {
  return {
    days: [{
      date: "2026-07-18",
      entries: [{
        createdAt: "2026-07-17T16:00:00.000Z",
        id: entryId,
        sequence: 1,
        source: "canonical journal source",
        timezoneOffsetMinutes: 480,
        updatedAt: "2026-07-17T16:01:00.000Z",
      }],
      lastIssuedSequence: 3,
    }],
    schemaVersion: 3 as const,
    syntaxSource: contractSyntax,
  };
}

describe("Journal v3 wire contract", () => {
  it("parses the exact no-purpose content, snapshot, and commit shapes", () => {
    const content = journalContent();

    expect(parseJournalContent(content)).toEqual(content);
    expect(parseJournalSnapshot({ content, revision })).toEqual({
      content,
      revision,
    });
    expect(parseJournalCommit({ baseRevision: revision, content })).toEqual({
      baseRevision: revision,
      content,
    });
    expect(createEmptyJournalContent()).toEqual({
      days: [],
      schemaVersion: 3,
      syntaxSource: contractSyntax,
    });
    expect(contractSyntax).toBe(domainSyntax);
  });

  it("keeps stable ids, day order, entry order, and counters exact", () => {
    expect(isJournalEntryId(entryId)).toBe(true);
    expect(isJournalEntryId(entryId.toUpperCase())).toBe(false);
    expect(parseJournalContent({
      ...journalContent(),
      days: [
        journalContent().days[0],
        { date: "2026-07-19", entries: [], lastIssuedSequence: 7 },
      ],
    }).days.map(({ date }) => date)).toEqual(["2026-07-18", "2026-07-19"]);
    expect(serializeJournalRevisionContent(journalContent())).toContain(
      '"days":[{"date":"2026-07-18","entries"',
    );
  });

  it("rejects old/future versions, purpose fields, duplicate ids, and invalid counters", () => {
    expect(() => parseJournalContent({
      ...journalContent(),
      schemaVersion: 2,
    })).toThrow(UnsupportedWireVersionError);
    expect(() => parseJournalContent({
      ...journalContent(),
      purpose: "system-journal",
    })).toThrow(WireContractError);
    expect(() => parseJournalContent({
      ...journalContent(),
      days: [journalContent().days[0], journalContent().days[0]],
    })).toThrow("duplicate day");
    expect(() => parseJournalContent({
      ...journalContent(),
      days: [{
        ...journalContent().days[0],
        entries: [
          journalContent().days[0]!.entries[0],
          journalContent().days[0]!.entries[0],
        ],
      }],
    })).toThrow("duplicate entry id");
    expect(() => parseJournalContent({
      ...journalContent(),
      days: [{
        ...journalContent().days[0],
        lastIssuedSequence: 10_000,
      }],
    })).toThrow("between 1 and 9999");
  });
});
