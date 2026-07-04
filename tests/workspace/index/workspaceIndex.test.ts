import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../src/ctn-syntax/defaultSyntaxProfile";
import { createNoteRecord } from "../../../src/workspace/model/workspaceData";
import { createWorkspaceIndex } from "../../../src/workspace/index/workspaceIndex";
import { createInitialWorkspaceRuntime } from "../../../src/workspace/runtime/workspaceRuntime";

const timestamp = "2026-07-04T00:00:00.000Z";

describe("createWorkspaceIndex", () => {
  it("materializes parsed notes and reference graph data", () => {
    const source = createNoteRecord(
      "note-source",
      "Source [[Target]]",
      timestamp,
    );
    const target = createNoteRecord("note-target", "Target", timestamp);
    const workspace = {
      ...createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
      notes: [source, target],
    };
    const index = createWorkspaceIndex(workspace);

    expect(
      index.parsedNotesById.get("note-source")?.document.blocks,
    ).toHaveLength(1);
    expect(index.referenceGraph.edges).toEqual([
      expect.objectContaining({
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ]);
  });
});
