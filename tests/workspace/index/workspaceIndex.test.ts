import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../src/ctn-syntax/defaultSyntaxProfile";
import { createNoteRecord } from "../../../src/workspace/model/workspaceData";
import {
  createWorkspaceIndex,
  createWorkspaceIndexCache,
} from "../../../src/workspace/index/workspaceIndex";
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

  it("reuses parsed documents for unchanged note sources", () => {
    const source = createNoteRecord("note-source", "Source", timestamp);
    const target = createNoteRecord("note-target", "Target", timestamp);
    const workspace = {
      ...createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
      notes: [source, target],
    };
    const firstIndex = createWorkspaceIndex(workspace);
    const secondIndex = createWorkspaceIndex(
      {
        ...workspace,
        notes: [
          source,
          {
            ...target,
            source: "Target\n\t: Changed",
          },
        ],
      },
      firstIndex,
    );

    expect(secondIndex.parsedNotesById.get("note-source")?.document).toBe(
      firstIndex.parsedNotesById.get("note-source")?.document,
    );
    expect(secondIndex.parsedNotesById.get("note-target")?.document).not.toBe(
      firstIndex.parsedNotesById.get("note-target")?.document,
    );
  });

  it("keeps parse reuse inside the workspace index cache", () => {
    const note = createNoteRecord("note-source", "Source", timestamp);
    const cache = createWorkspaceIndexCache();
    const firstIndex = cache.resolve({
      ...createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
      notes: [note],
    });
    const secondIndex = cache.resolve({
      ...createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
      notes: [
        {
          ...note,
          title: "Renamed Source",
        },
      ],
    });

    expect(secondIndex.parsedNotesById.get("note-source")?.document).toBe(
      firstIndex.parsedNotesById.get("note-source")?.document,
    );
  });

  it("reparses unchanged note sources when the parse profile changes", () => {
    const note = createNoteRecord("note-source", "Source", timestamp);
    const workspace = {
      ...createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
      notes: [note],
    };
    const firstIndex = createWorkspaceIndex(workspace);
    const secondIndex = createWorkspaceIndex(
      {
        ...workspace,
        syntaxProfile: {
          ...workspace.syntaxProfile,
          conceptRule: {
            ...workspace.syntaxProfile.conceptRule,
            label: "概念",
          },
        },
      },
      firstIndex,
    );

    expect(secondIndex.parsedNotesById.get("note-source")?.document).not.toBe(
      firstIndex.parsedNotesById.get("note-source")?.document,
    );
  });
});
