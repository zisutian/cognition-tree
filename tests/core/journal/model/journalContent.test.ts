// SPDX-License-Identifier: GPL-3.0-or-later

import { replaceCtnSourceTitle } from "../../../../core/ctn/metadata/sourceMetadata";
import { deleteJournalEntry } from "../../../../core/journal/commands/journalCommands";
import { readCtnCanonicalTitleHeader } from "../../../../core/ctn/parser/parseCtnDocument";
import {
  formatJournalEntryTitle,
  getJournalCreationTimezoneOffsetMinutes,
  validateJournalContentAnalysisTransition,
  validateJournalContent,
  validateJournalContentTransition,
} from "../../../../core/journal/model/journalContent";
import { createJournalParseIndex } from "../../../../core/journal/indexes/journalParseIndex";
import { describe, expect, it } from "vitest";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  journalEntries,
  replaceJournalTestEntries,
  tamperJournalTestBodyBlockTime,
  tamperJournalTestEntryCreation,
  updateJournalTestBody,
} from "../journalTestFixture";

describe("journal content", () => {
  function captureTransition(operation: () => unknown) {
    try {
      return { status: "accepted" as const, value: operation() };
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "unknown",
        status: "rejected" as const,
      };
    }
  }

  it("formats immutable titles with the creation-time ISO offset direction", () => {
    expect(
      formatJournalEntryTitle("2026-07-18T00:00:01.250Z", 480, 1),
    ).toBe("2026-07-18-0001");
    expect(
      formatJournalEntryTitle("2026-03-01T02:30:00.000Z", -300, 12),
    ).toBe("2026-02-28-0012");

    const date = new Date("2026-07-18T00:00:00.000Z");
    const original = date.getTimezoneOffset;

    date.getTimezoneOffset = () => -480;
    expect(getJournalCreationTimezoneOffsetMinutes(date)).toBe(480);
    date.getTimezoneOffset = original;
  });

  it("accepts canonical entries and rejects a changed title", () => {
    const content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.250Z",
      entryIndex: 1,
    });

    expect(validateJournalContent(content)).toBe(content);
    const entry = journalEntries(content)[0];
    const tampered = replaceJournalTestEntries(content, [{
        ...entry,
        source: replaceCtnSourceTitle(
          entry.source,
          "可修改标题",
          entry.createdAt,
        ),
      }]);

    expect(() => validateJournalContent(tampered)).toThrow(
      /title must remain 2026-07-18-0001/,
    );
  });

  it("rejects title metadata changes even when the visible title is restored", () => {
    const content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const entry = journalEntries(content)[0];
    const header = readCtnCanonicalTitleHeader(entry.source);
    const tampered = replaceJournalTestEntries(content, [{
        ...entry,
        source: replaceCtnSourceTitle(
          entry.source,
          header.title,
          "2026-07-18T00:05:00.000Z",
        ),
      }]);

    expect(() => validateJournalContent(tampered)).toThrow(
      /title metadata is immutable/,
    );
  });

  it("rejects duplicate entry and CTN block identities", () => {
    const one = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const oneEntries = journalEntries(one);
    const duplicateEntry = replaceJournalTestEntries(
      one,
      [...oneEntries, oneEntries[0]],
    );

    expect(() => validateJournalContent(duplicateEntry)).toThrow(
      /Duplicate journal entry id/,
    );

    const two = appendJournalTestEntry(one, {
      blockIdStart: 2,
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 2,
    });
    const twoEntries = journalEntries(two);
    const duplicateBlock = replaceJournalTestEntries(two, [
      twoEntries[0],
      { ...twoEntries[1], source: twoEntries[0].source },
    ]);

    expect(() => validateJournalContent(duplicateBlock)).toThrow(
      /title must remain 2026-07-18-0002/,
    );
  });

  it("keeps surviving entry creation identity immutable across snapshots", () => {
    const empty = createEmptyJournalContent();
    const created = appendJournalTestEntry(empty, {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const edited = updateJournalTestBody(created, {
      body: "正文",
      entryIndex: 1,
      updatedAt: "2026-07-18T00:05:00.000Z",
    });
    const deleted = deleteJournalEntry(created, journalEntries(created)[0].id);
    const tampered = tamperJournalTestEntryCreation(created, {
      createdAt: "2026-08-19T10:11:12.000Z",
      entryIndex: 1,
      timezoneOffsetMinutes: -300,
    });

    expect(validateJournalContent(tampered)).toBe(tampered);
    expect(validateJournalContentTransition(empty, created)).toBe(created);
    expect(validateJournalContentTransition(created, edited)).toBe(edited);
    expect(validateJournalContentTransition(created, deleted)).toBe(deleted);
    expect(() => validateJournalContentTransition(created, empty)).toThrow(
      /day .* cannot be removed/,
    );
    expect(() => validateJournalContentTransition(edited, created)).toThrow(
      /updatedAt cannot move backwards/,
    );
    expect(() => validateJournalContentTransition(created, tampered)).toThrow(
      /createdAt is immutable/,
    );
  });

  it("requires canonical day and entry ordering with matching creation dates", () => {
    let content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    content = appendJournalTestEntry(content, {
      blockIdStart: 2,
      createdAt: "2026-08-18T00:00:01.000Z",
      entryIndex: 2,
    });

    expect(() => validateJournalContent({
      ...content,
      days: [...content.days].reverse(),
    })).toThrow(/ascending date order/);
    expect(() => validateJournalContent({
      ...content,
      days: [{
        ...content.days[0],
        entries: [content.days[1].entries[0]],
      }, content.days[1]],
    })).toThrow(/belongs to .* not/);
  });

  it("keeps every CTN block inside its entry lifetime", () => {
    const created = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const edited = updateJournalTestBody(created, {
      body: "正文",
      entryIndex: 1,
      updatedAt: "2026-07-18T00:05:00.000Z",
    });
    const createdTooEarly = tamperJournalTestBodyBlockTime(edited, {
      createdAt: "2026-07-17T23:59:59.000Z",
      entryIndex: 1,
    });
    const updatedTooLate = tamperJournalTestBodyBlockTime(edited, {
      entryIndex: 1,
      updatedAt: "2026-07-18T00:05:01.000Z",
    });

    expect(() => validateJournalContent(createdTooEarly)).toThrow(
      /created before the entry/,
    );
    expect(() => validateJournalContent(updatedTooLate)).toThrow(
      /updated after the entry/,
    );
  });

  it("keeps raw and prepared transition validation equivalent", () => {
    const previous = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const edited = updateJournalTestBody(previous, {
      body: "正文",
      entryIndex: 1,
      updatedAt: "2026-07-18T00:05:00.000Z",
    });
    const candidates = [
      edited,
      createEmptyJournalContent(),
      tamperJournalTestEntryCreation(previous, {
        createdAt: "2026-08-19T10:11:12.000Z",
        entryIndex: 1,
        timezoneOffsetMinutes: -300,
      }),
      tamperJournalTestBodyBlockTime(edited, {
        createdAt: "2026-07-18T00:04:00.000Z",
        entryIndex: 1,
      }),
    ];
    const previousIndex = createJournalParseIndex(previous);

    for (const next of candidates) {
      const raw = captureTransition(() =>
        validateJournalContentTransition(previous, next)
      );
      const prepared = captureTransition(() =>
        validateJournalContentAnalysisTransition(
          previousIndex.validation,
          createJournalParseIndex(next, previousIndex).validation,
        )
      );

      expect(prepared).toEqual(raw);
    }
  });

  it("keeps surviving block creation time immutable and update time monotonic", () => {
    const created = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:01.000Z",
      entryIndex: 1,
    });
    const firstEdit = updateJournalTestBody(created, {
      body: "正文",
      entryIndex: 1,
      updatedAt: "2026-07-18T00:05:00.000Z",
    });
    const secondEdit = updateJournalTestBody(firstEdit, {
      body: "新正文",
      entryIndex: 1,
      previousBody: "正文",
      updatedAt: "2026-07-18T00:06:00.000Z",
    });
    const changedCreatedAt = tamperJournalTestBodyBlockTime(firstEdit, {
      createdAt: "2026-07-18T00:04:00.000Z",
      entryIndex: 1,
    });
    const rolledBackUpdatedAt = tamperJournalTestBodyBlockTime(secondEdit, {
      entryIndex: 1,
      updatedAt: "2026-07-18T00:05:00.000Z",
    });

    expect(validateJournalContent(changedCreatedAt)).toBe(changedCreatedAt);
    expect(validateJournalContent(rolledBackUpdatedAt)).toBe(
      rolledBackUpdatedAt,
    );
    expect(() =>
      validateJournalContentTransition(firstEdit, changedCreatedAt)
    ).toThrow(/block .* createdAt is immutable/);
    expect(() =>
      validateJournalContentTransition(secondEdit, rolledBackUpdatedAt)
    ).toThrow(/block .* updatedAt cannot move backwards/);
  });
});
