import { describe, expect, it } from "vitest";
import { createJournalParseIndex } from "../../../../core/journal/indexes/journalParseIndex";
import { recoverJournalLocalConflictCopies } from "../../../../application/journal/persistence/journalConflictRecovery";
import { mergeJournalContent } from "../../../../application/journal/persistence/journalThreeWayMerge";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  journalEntries,
  updateJournalTestBody,
} from "../../../core/journal/journalTestFixture";

describe("Journal three-way persistence", () => {
  it("merges independent entries and reports entry conflicts", () => {
    let base = createEmptyJournalContent();

    base = appendJournalTestEntry(base, {
      createdAt: "2026-07-18T00:00:00.000Z",
      entryIndex: 1,
      timezoneOffsetMinutes: 0,
    });
    base = appendJournalTestEntry(base, {
      createdAt: "2026-07-18T01:00:00.000Z",
      entryIndex: 2,
      timezoneOffsetMinutes: 0,
    });
    const local = updateJournalTestBody(base, {
      body: "local entry",
      entryIndex: 1,
      updatedAt: "2026-07-18T02:00:00.000Z",
    });
    const remote = updateJournalTestBody(base, {
      body: "remote entry",
      createBlockIdStart: 200,
      entryIndex: 2,
      updatedAt: "2026-07-18T03:00:00.000Z",
    });
    const baseIndex = createJournalParseIndex(base);
    const prepare = (content: typeof base) => ({
      content,
      projection: createJournalParseIndex(content, baseIndex),
    });
    const merged = mergeJournalContent(
      { content: base, projection: baseIndex },
      prepare(local),
      prepare(remote),
    );

    expect(merged.status).toBe("merged");
    if (merged.status === "merged") {
      expect(journalEntries(merged.content).map(({ source }) => source))
        .toEqual([
          journalEntries(local)[0]!.source,
          journalEntries(remote)[1]!.source,
        ]);
      expect(merged.projection.analysisStats.runCount).toBe(0);
    }
    const conflicting = updateJournalTestBody(base, {
      body: "other entry",
      entryIndex: 1,
      updatedAt: "2026-07-18T04:00:00.000Z",
    });

    expect(mergeJournalContent(
      { content: base, projection: baseIndex },
      prepare(local),
      prepare(conflicting),
    )).toEqual({
      status: "conflict",
      unitIds: [`journal:entry:${journalEntries(base)[0]!.id}`],
    });

    const preferredRemote = updateJournalTestBody(remote, {
      body: "other entry",
      entryIndex: 1,
      updatedAt: "2026-07-18T04:00:00.000Z",
    });
    const preferredLocal = mergeJournalContent(
      { content: base, projection: baseIndex },
      prepare(local),
      prepare(preferredRemote),
      "local",
    );

    expect(preferredLocal.status).toBe("merged");
    if (preferredLocal.status === "merged") {
      expect(journalEntries(preferredLocal.content).map(({ source }) => source))
        .toEqual([
          journalEntries(local)[0]!.source,
          journalEntries(remote)[1]!.source,
        ]);
    }
  });

  it("creates a recovery entry from the persisted local body", () => {
    let nextId = 500;
    let base = createEmptyJournalContent();
    const timestamp = "2026-07-18T00:00:00.000Z";

    base = appendJournalTestEntry(base, {
      createdAt: timestamp,
      entryIndex: 1,
      timezoneOffsetMinutes: 0,
    });
    const local = updateJournalTestBody(base, {
      body: ": 本地日记",
      entryIndex: 1,
      updatedAt: "2026-07-18T01:00:00.000Z",
    });
    const baseProjection = createJournalParseIndex(base);
    const recovered = recoverJournalLocalConflictCopies(
      { content: base, projection: baseProjection },
      { unitIds: [`journal:entry:${journalEntries(base)[0]!.id}`] },
      {
        createBlockId: () =>
          `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
        createJournalEntryId: () =>
          `journal-entry-00000000-0000-4000-8000-${
            String(nextId++).padStart(12, "0")
          }` as const,
        now: () => "2026-07-29T12:00:00.000Z",
        timezoneOffsetMinutes: () => 0,
      },
      {
        content: local,
        projection: createJournalParseIndex(local, baseProjection),
      },
    ).content;

    expect(journalEntries(recovered)).toHaveLength(2);
    expect(journalEntries(recovered)[1]!.source).toContain(": 本地日记");
  });
});
