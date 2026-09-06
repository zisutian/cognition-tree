import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createJournalParseIndex } from "../../../../core/journal/indexes/journalParseIndex";
import { mergeJournalContent } from "../../../../application/journal/persistence/journalThreeWayMerge";
import { createFileSystemJournalContentStore } from "../../../../infrastructure/server/repository/built-ins/journalStore";
import { appendJournalTestEntry, createEmptyJournalContent, journalEntries } from "../../../core/journal/journalTestFixture";

describe("concurrent daily Journal sequences", () => {
  it.each(["local", "remote"] as const)("persists the %s entry for a colliding sequence and preserves independent entries", async (preference) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ctn-journal-sequence-"));
    try {
      const base = createEmptyJournalContent();
      const local = appendJournalTestEntry(base, {
        createdAt: "2026-09-06T01:00:00.000Z", entryIndex: 1, blockIdStart: 1, timezoneOffsetMinutes: 0,
      });
      const remote = appendJournalTestEntry(base, {
        createdAt: "2026-09-06T02:00:00.000Z", entryIndex: 2, blockIdStart: 10, timezoneOffsetMinutes: 0,
      });
      const withIndependent = appendJournalTestEntry(local, {
        createdAt: "2026-09-07T01:00:00.000Z", entryIndex: 3, blockIdStart: 20, timezoneOffsetMinutes: 0,
      });
      const prepare = (content: typeof base) => ({ content, projection: createJournalParseIndex(content) });
      expect(mergeJournalContent(prepare(base), prepare(withIndependent), prepare(remote)))
        .toEqual({ status: "conflict", unitIds: ["journal:day:2026-09-06:sequence:1"] });
      const merged = mergeJournalContent(prepare(base), prepare(withIndependent), prepare(remote), preference);
      expect(merged.status).toBe("merged");
      if (merged.status !== "merged") throw new Error("Sequence preference was not resolved");
      const file = path.join(directory, "journal.json");
      await writeFile(file, JSON.stringify(remote), { mode: 0o600 });
      const store = createFileSystemJournalContentStore(file);
      const before = await store.loadSnapshot();
      await store.commit({ baseRevision: before.revision, content: merged.content, projection: merged.projection });
      const after = await createFileSystemJournalContentStore(file).loadSnapshot();
      expect(journalEntries(after.content)).toEqual([
        journalEntries(preference === "local" ? local : remote)[0],
        journalEntries(withIndependent)[1],
      ]);
      expect(after.content.days.map(({ lastIssuedSequence }) => lastIssuedSequence)).toEqual([1, 1]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
