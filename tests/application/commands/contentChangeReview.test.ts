// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  projectContentLineDiff,
  summarizeContentBlockChanges,
} from "../../../application/commands/contentChangeReview.ts";

describe("Agent proposal review projection", () => {
  it("projects added and removed lines with bounded context", () => {
    const before = ["one", "two", "three", "four", "five", "six", "seven"]
      .join("\n");
    const after = ["one", "two", "three", "changed", "five", "six", "seven"]
      .join("\n");
    const hunks = projectContentLineDiff(before, after);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.lines).toEqual([
      { afterLineNumber: 1, beforeLineNumber: 1, kind: "context", text: "one" },
      { afterLineNumber: 2, beforeLineNumber: 2, kind: "context", text: "two" },
      { afterLineNumber: 3, beforeLineNumber: 3, kind: "context", text: "three" },
      { afterLineNumber: null, beforeLineNumber: 4, kind: "removed", text: "four" },
      { afterLineNumber: 4, beforeLineNumber: null, kind: "added", text: "changed" },
      { afterLineNumber: 5, beforeLineNumber: 5, kind: "context", text: "five" },
      { afterLineNumber: 6, beforeLineNumber: 6, kind: "context", text: "six" },
      { afterLineNumber: 7, beforeLineNumber: 7, kind: "context", text: "seven" },
    ]);
  });

  it("aggregates block changes without retaining block IDs", () => {
    const summary = summarizeContentBlockChanges([
      {
        blockId: "block-secret-a",
        kind: "created",
        resourceId: "resource-a",
        updatedAt: "2026-08-25T00:00:00.000Z",
      },
      {
        blockId: "block-secret-b",
        kind: "state-updated",
        resourceId: "resource-a",
        updatedAt: "2026-08-25T00:00:00.000Z",
      },
    ]);

    expect(summary).toEqual({
      created: 1,
      deleted: 0,
      moved: 0,
      stateUpdated: 1,
      updated: 0,
    });
    expect(JSON.stringify(summary)).not.toContain("block-secret");
  });
});
