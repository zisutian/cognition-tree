import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
import {
  createInitialWorkspaceData,
  createNoteRecord,
  type NoteRecord,
} from "../../../src/workspace/model/workspaceData";
import {
  createWorkspaceParseIndex,
  createWorkspaceParseIndexCache,
} from "../../../src/workspace/indexes/workspaceParseIndex";
import { createWorkspaceStructureIndex } from "../../../src/workspace/indexes/workspaceStructureIndex";
import type { CtnSyntaxProfile } from "../../../src/ctn/syntax/types";

const timestamp = "2026-07-04T00:00:00.000Z";

function createParseIndexSource(
  notes: NoteRecord[],
  syntaxProfile: CtnSyntaxProfile = defaultCtnSyntaxProfile,
) {
  return {
    syntaxProfile,
    workspace: createWorkspaceStructureIndex({
      ...createInitialWorkspaceData(),
      notes,
    }),
  };
}

describe("createWorkspaceParseIndex", () => {
  it("parses notes only when a parsed note is requested", () => {
    const note = createNoteRecord(
      "note-source",
      "Source [[Target]]",
      timestamp,
    );
    const source = createParseIndexSource([note]);
    const index = createWorkspaceParseIndex(source);

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
    const index = createWorkspaceParseIndex(
      createParseIndexSource([source, target]),
    );

    expect(index.parseCache.entriesById.size).toBe(0);
    expect(index.referenceGraph.edges).toEqual([
      expect.objectContaining({
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ]);
    expect(index.parseCache.entriesById.size).toBe(2);
  });

  it("resolves a reference to every note with the same normalized title", () => {
    const source = createNoteRecord(
      "note-source",
      "Source [[Target]]",
      timestamp,
    );
    const firstTarget = createNoteRecord("note-target-a", "Target", timestamp);
    const secondTarget = createNoteRecord(
      "note-target-b",
      "  Target  ",
      timestamp,
    );
    const index = createWorkspaceParseIndex(
      createParseIndexSource([source, firstTarget, secondTarget]),
    );

    expect(
      index.referenceGraph.edges.map((edge) => edge.targetNoteId),
    ).toEqual(["note-target-a", "note-target-b"]);
  });

  it("reuses parsed documents for unchanged note sources", () => {
    const source = createNoteRecord("note-source", "Source", timestamp);
    const target = createNoteRecord("note-target", "Target", timestamp);
    const firstParseSource = createParseIndexSource([source, target]);
    const firstIndex = createWorkspaceParseIndex(firstParseSource);
    const firstParsedSource = firstIndex.getParsedNote("note-source");
    const firstTarget = firstIndex.getParsedNote("note-target");
    const secondIndex = createWorkspaceParseIndex(
      createParseIndexSource([
        source,
        {
          ...target,
          source: "Target\n\t: Changed",
        },
      ]),
      firstIndex,
    );
    const secondSource = secondIndex.getParsedNote("note-source");
    const secondTarget = secondIndex.getParsedNote("note-target");

    expect(secondSource?.document).toBe(firstParsedSource?.document);
    expect(secondTarget?.document).not.toBe(firstTarget?.document);
  });

  it("keeps parse reuse inside the workspace index cache", () => {
    const note = createNoteRecord("note-source", "Source", timestamp);
    const cache = createWorkspaceParseIndexCache();
    const firstIndex = cache.resolve(createParseIndexSource([note]));
    const firstParsedNote = firstIndex.getParsedNote("note-source");
    const secondIndex = cache.resolve(
      createParseIndexSource([
        {
          ...note,
          title: "Renamed Source",
        },
      ]),
    );
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
    const firstIndex = createWorkspaceParseIndex(
      createParseIndexSource([source, target]),
    );
    const firstGraph = firstIndex.referenceGraph;
    const secondIndex = createWorkspaceParseIndex(
      createParseIndexSource([{ ...source }, { ...target }]),
      firstIndex,
    );

    expect(secondIndex.referenceGraph).toBe(firstGraph);
  });

  it("reparses unchanged note sources when the parse profile changes", () => {
    const note = createNoteRecord("note-source", "Source", timestamp);
    const firstIndex = createWorkspaceParseIndex(createParseIndexSource([note]));
    const firstParsedNote = firstIndex.getParsedNote("note-source");
    const secondIndex = createWorkspaceParseIndex(
      createParseIndexSource(
        [note],
        {
          ...defaultCtnSyntaxProfile,
          conceptRule: {
            ...defaultCtnSyntaxProfile.conceptRule,
            label: "概念",
          },
        },
      ),
      firstIndex,
    );
    const secondParsedNote = secondIndex.getParsedNote("note-source");

    expect(secondParsedNote?.document).not.toBe(firstParsedNote?.document);
  });
});
