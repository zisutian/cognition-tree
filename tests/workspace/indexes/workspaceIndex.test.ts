import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
import { createNoteRecord } from "../../../src/workspace/model/workspaceData";
import {
  createWorkspaceIndex,
  createWorkspaceIndexCache,
} from "../../../src/workspace/indexes/workspaceIndex";
import { createInitialWorkspaceContext } from "../../../src/workspace/context/workspaceContext";

const timestamp = "2026-07-04T00:00:00.000Z";

describe("createWorkspaceIndex", () => {
  it("parses notes only when a parsed note is requested", () => {
    const note = createNoteRecord(
      "note-source",
      "Source [[Target]]",
      timestamp,
    );
    const workspace = {
      ...createInitialWorkspaceContext(defaultCtnSyntaxProfile),
      notes: [note],
    };
    const index = createWorkspaceIndex(workspace);

    expect(index.parseCache.entriesById.size).toBe(0);
    expect(index.getParsedNote("note-source")?.document.blocks).toHaveLength(1);
    expect(index.parseCache.entriesById.size).toBe(1);
    expect(index.getParsedNote("missing-note")).toBeNull();
  });

  it("builds reference graph data on demand", () => {
    const source = createNoteRecord(
      "note-source",
      "Source [[Target]]",
      timestamp,
    );
    const target = createNoteRecord("note-target", "Target", timestamp);
    const workspace = {
      ...createInitialWorkspaceContext(defaultCtnSyntaxProfile),
      notes: [source, target],
    };
    const index = createWorkspaceIndex(workspace);

    expect(index.parseCache.entriesById.size).toBe(0);
    expect(index.referenceGraph.edges).toEqual([
      expect.objectContaining({
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ]);
    expect(index.parseCache.entriesById.size).toBe(2);
  });

  it("reuses parsed documents for unchanged note sources", () => {
    const source = createNoteRecord("note-source", "Source", timestamp);
    const target = createNoteRecord("note-target", "Target", timestamp);
    const workspace = {
      ...createInitialWorkspaceContext(defaultCtnSyntaxProfile),
      notes: [source, target],
    };
    const firstIndex = createWorkspaceIndex(workspace);
    const firstSource = firstIndex.getParsedNote("note-source");
    const firstTarget = firstIndex.getParsedNote("note-target");
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
    const secondSource = secondIndex.getParsedNote("note-source");
    const secondTarget = secondIndex.getParsedNote("note-target");

    expect(secondSource?.document).toBe(firstSource?.document);
    expect(secondTarget?.document).not.toBe(firstTarget?.document);
  });

  it("keeps parse reuse inside the workspace index cache", () => {
    const note = createNoteRecord("note-source", "Source", timestamp);
    const cache = createWorkspaceIndexCache();
    const firstIndex = cache.resolve({
      ...createInitialWorkspaceContext(defaultCtnSyntaxProfile),
      notes: [note],
    });
    const firstParsedNote = firstIndex.getParsedNote("note-source");
    const secondIndex = cache.resolve({
      ...createInitialWorkspaceContext(defaultCtnSyntaxProfile),
      notes: [
        {
          ...note,
          title: "Renamed Source",
        },
      ],
    });
    const secondParsedNote = secondIndex.getParsedNote("note-source");

    expect(secondParsedNote?.document).toBe(firstParsedNote?.document);
  });

  it("reuses reference graph data for unchanged note graph inputs", () => {
    const source = createNoteRecord(
      "note-source",
      "Source [[Target]]",
      timestamp,
    );
    const target = createNoteRecord("note-target", "Target", timestamp);
    const workspace = {
      ...createInitialWorkspaceContext(defaultCtnSyntaxProfile),
      notes: [source, target],
    };
    const firstIndex = createWorkspaceIndex(workspace);
    const firstGraph = firstIndex.referenceGraph;
    const secondIndex = createWorkspaceIndex(
      {
        ...workspace,
        notes: [{ ...source }, { ...target }],
      },
      firstIndex,
    );

    expect(secondIndex.referenceGraph).toBe(firstGraph);
  });

  it("reparses unchanged note sources when the parse profile changes", () => {
    const note = createNoteRecord("note-source", "Source", timestamp);
    const workspace = {
      ...createInitialWorkspaceContext(defaultCtnSyntaxProfile),
      notes: [note],
    };
    const firstIndex = createWorkspaceIndex(workspace);
    const firstParsedNote = firstIndex.getParsedNote("note-source");
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
    const secondParsedNote = secondIndex.getParsedNote("note-source");

    expect(secondParsedNote?.document).not.toBe(firstParsedNote?.document);
  });
});
