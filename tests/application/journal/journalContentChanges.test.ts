// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { projectJournalContentReview } from "../../../application/journal/journalContentProjection.ts";
import { prepareJournalRepositoryContent } from "../../../application/journal/persistence/journalRepositoryPreparation.ts";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  journalBlockId,
  journalEntryId,
  updateJournalTestBody,
} from "../../core/journal/journalTestFixture.ts";

describe("Journal Agent proposal review", () => {
  it("projects the entry title and body diff", () => {
    const created = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-08-25T10:00:00.000Z",
      entryIndex: 1,
    });
    const updated = updateJournalTestBody(created, {
      body: "- 今日完成审查投影",
      entryIndex: 1,
      updatedAt: "2026-08-25T10:05:00.000Z",
    });
    const entryId = journalEntryId(1);
    const before = prepareJournalRepositoryContent(created);
    const after = prepareJournalRepositoryContent(updated, before);
    const review = projectJournalContentReview({
      afterIndex: after,
      beforeIndex: before,
      changes: {
        blocks: [{
          blockId: journalBlockId(100),
          kind: "created",
          resourceId: entryId,
          updatedAt: "2026-08-25T10:05:00.000Z",
        }],
        occurredAt: "2026-08-25T10:05:00.000Z",
        resources: [{
          domain: "journal",
          kind: "updated",
          resourceId: entryId,
          version: `sha256:${"1".repeat(64)}`,
        }],
      },
    });

    expect(review.resources).toHaveLength(1);
    expect(review.resources[0]).toMatchObject({
      actions: ["content-updated"],
      after: { label: "2026-08-25-0001", path: "2026-08-25-0001" },
      before: { label: "2026-08-25-0001", path: "2026-08-25-0001" },
      blockSummary: { created: 1 },
      resourceId: entryId,
      type: "journal-entry",
    });
    expect(JSON.stringify(review.resources[0]?.diff)).toContain(
      "今日完成审查投影",
    );
    expect(JSON.stringify(review)).not.toContain(journalBlockId(100));
  });
});
