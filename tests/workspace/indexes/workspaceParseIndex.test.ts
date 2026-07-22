import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../ctn/syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../../ctn/syntax/types";
import type { NoteRecord } from "../../../src/workspace/model/workspaceData";
import {
  createWorkspaceParseIndex,
  createWorkspaceParseIndexCache,
} from "../../../src/workspace/indexes/workspaceParseIndex";
import { createWorkspaceStructureIndex } from "../../../src/workspace/indexes/workspaceStructureIndex";
import {
  createCanonicalTestNote,
  createCanonicalTestSource,
  createWorkspaceDataWithNotes,
} from "../workspaceTestFixture";

function createParseIndexSource(
  notes: NoteRecord[],
  syntaxProfile: CtnSyntaxProfile = defaultCtnSyntaxProfile,
) {
  return {
    syntaxProfile,
    workspace: createWorkspaceStructureIndex(createWorkspaceDataWithNotes(notes)),
  };
}

function scanReferenceGraph(index: ReturnType<typeof createWorkspaceParseIndex>) {
  const scan = index.createScan();

  scan.noteIds.forEach((noteId) => scan.scanNote(noteId));
  return scan.complete();
}

describe("createWorkspaceParseIndex", () => {
  it("parses notes only when a parsed note is requested", () => {
    const note = createCanonicalTestNote("note-source", "Source [[Target]]");
    const index = createWorkspaceParseIndex(createParseIndexSource([note]));

    expect(index.parseCache.entriesById.size).toBe(0);
    expect(index.getParsedNote(note.id)?.document.blocks).toHaveLength(1);
    expect(index.parseCache.entriesById.size).toBe(1);
    expect(index.getParsedNote("missing-note")).toBeNull();
  });

  it("builds the reference graph once on demand", () => {
    const source = createCanonicalTestNote(
      "note-source",
      "Source [[Target]]",
    );
    const target = createCanonicalTestNote("note-target", "Target", {
      idOffset: 100,
    });
    const index = createWorkspaceParseIndex(
      createParseIndexSource([source, target]),
    );

    expect(index.parseCache.entriesById.size).toBe(0);
    const graph = scanReferenceGraph(index);

    expect(graph.edges).toEqual([
      expect.objectContaining({
        count: 1,
        sourceNoteId: source.id,
        targetNoteId: target.id,
      }),
    ]);
    expect(index.parseCache.entriesById.size).toBe(2);
  });

  it("reports duplicate-title references as ambiguous without an arbitrary edge", () => {
    const source = createCanonicalTestNote(
      "note-source",
      "Source [[Target]] and [[Target]]",
    );
    const firstTarget = createCanonicalTestNote("note-target-a", "Target", {
      idOffset: 100,
    });
    const secondTarget = createCanonicalTestNote(
      "note-target-b",
      "Target  ",
      { idOffset: 200 },
    );
    const graph = scanReferenceGraph(
      createWorkspaceParseIndex(
        createParseIndexSource([source, firstTarget, secondTarget]),
      ),
    );

    expect(graph.edges).toEqual([]);
    expect(graph.ambiguousReferences).toEqual([
      expect.objectContaining({
        candidateNoteIds: [firstTarget.id, secondTarget.id],
        count: 2,
        sourceNoteId: source.id,
        targetText: "Target",
      }),
    ]);
    expect(graph.nodes.find((node) => node.id === source.id)).toMatchObject({
      isolated: false,
      referencesOut: 2,
    });
  });

  it("keeps explicit self references as self-loop edges and statistics", () => {
    const note = createCanonicalTestNote(
      "note-self",
      "Self\nConcept [[Self]]",
    );
    const graph = scanReferenceGraph(
      createWorkspaceParseIndex(createParseIndexSource([note])),
    );

    expect(graph.edges).toEqual([
      expect.objectContaining({
        count: 1,
        sourceNoteId: note.id,
        targetNoteId: note.id,
      }),
    ]);
    expect(graph.nodes).toEqual([
      expect.objectContaining({
        id: note.id,
        isolated: false,
        referencesIn: 1,
        referencesOut: 1,
      }),
    ]);
  });

  it("keeps unresolved references visible but ignores multiline bodies", () => {
    const source = createCanonicalTestNote(
      "note-source",
      "Source\nConcept [[Missing]] and [[Missing]]\n\t```txt\n\t[[Target]]\n\t```",
    );
    const target = createCanonicalTestNote("note-target", "Target", {
      idOffset: 100,
    });
    const graph = scanReferenceGraph(
      createWorkspaceParseIndex(createParseIndexSource([source, target])),
    );

    expect(graph.edges).toEqual([]);
    expect(graph.unresolvedReferences).toEqual([
      expect.objectContaining({
        count: 2,
        sourceNoteId: source.id,
        targetText: "Missing",
      }),
    ]);
    expect(graph.nodes.find((node) => node.id === target.id)).toMatchObject({
      isolated: true,
    });
  });

  it("reuses only current parsed documents whose source and profile match", () => {
    const source = createCanonicalTestNote("note-source", "Source");
    const target = createCanonicalTestNote("note-target", "Target", {
      idOffset: 100,
    });
    const firstIndex = createWorkspaceParseIndex(
      createParseIndexSource([source, target]),
    );
    const firstParsedSource = firstIndex.getParsedNote(source.id);
    const firstParsedTarget = firstIndex.getParsedNote(target.id);
    const changedTarget = {
      ...target,
      source: createCanonicalTestSource("Target\n\t: Changed", {
        idOffset: 100,
      }),
    };
    const secondIndex = createWorkspaceParseIndex(
      createParseIndexSource([source, changedTarget]),
      firstIndex,
    );

    expect(secondIndex.getParsedNote(source.id)?.document).toBe(
      firstParsedSource?.document,
    );
    expect(secondIndex.getParsedNote(target.id)?.document).not.toBe(
      firstParsedTarget?.document,
    );
  });

  it("keeps parse reuse inside the cache and returns one index for one source", () => {
    const note = createCanonicalTestNote("note-source", "Source");
    const cache = createWorkspaceParseIndexCache();
    const source = createParseIndexSource([note]);
    const firstIndex = cache.resolve(source);
    const firstParsedNote = firstIndex.getParsedNote(note.id);

    expect(cache.resolve(source)).toBe(firstIndex);

    const copiedSource = createParseIndexSource([{ ...note }]);
    const secondIndex = cache.resolve(copiedSource);

    expect(secondIndex.getParsedNote(note.id)?.document).toBe(
      firstParsedNote?.document,
    );
  });

  it("supports incremental full-workspace scans", () => {
    const source = createCanonicalTestNote(
      "note-source",
      "Source\n\t: [[Missing]]",
    );
    const target = createCanonicalTestNote("note-target", "Target", {
      idOffset: 100,
    });
    const index = createWorkspaceParseIndex(
      createParseIndexSource([source, target]),
    );
    const scan = index.createScan();

    expect(scan.noteIds).toEqual([source.id, target.id]);
    expect(scan.scanNote(source.id)?.note.id).toBe(source.id);
    expect(() => scan.complete()).toThrow("Workspace parse scan is incomplete");
    scan.scanNote(target.id);
    expect(scan.complete().unresolvedReferences).toEqual([
      expect.objectContaining({
        count: 1,
        lineNumber: 4,
        sourceNoteId: source.id,
        targetText: "Missing",
      }),
    ]);
  });

  it("reuses reference graph data only when all graph inputs are unchanged", () => {
    const source = createCanonicalTestNote(
      "note-source",
      "Source [[Target]]",
    );
    const target = createCanonicalTestNote("note-target", "Target", {
      idOffset: 100,
    });
    const firstIndex = createWorkspaceParseIndex(
      createParseIndexSource([source, target]),
    );
    const firstGraph = scanReferenceGraph(firstIndex);
    const secondIndex = createWorkspaceParseIndex(
      createParseIndexSource([{ ...source }, { ...target }]),
      firstIndex,
    );

    expect(scanReferenceGraph(secondIndex)).toBe(firstGraph);
  });

  it("reparses unchanged sources when the parse profile changes", () => {
    const note = createCanonicalTestNote("note-source", "Source");
    const firstIndex = createWorkspaceParseIndex(createParseIndexSource([note]));
    const firstParsedNote = firstIndex.getParsedNote(note.id);
    const secondIndex = createWorkspaceParseIndex(
      createParseIndexSource([note], {
        ...defaultCtnSyntaxProfile,
        topLevelUnmarkedRule: {
          ...defaultCtnSyntaxProfile.topLevelUnmarkedRule!,
          label: "概念",
        },
      }),
      firstIndex,
    );

    expect(secondIndex.getParsedNote(note.id)?.document).not.toBe(
      firstParsedNote?.document,
    );
  });

  it("does not retain removed cache entries across 1,000 generations", () => {
    let previous = createWorkspaceParseIndex(
      createParseIndexSource([
        createCanonicalTestNote("note-0", "Generation 0"),
      ]),
    );
    previous.getParsedNote("note-0");

    for (let generation = 1; generation <= 1_000; generation += 1) {
      const note = createCanonicalTestNote(
        `note-${generation}`,
        `Generation ${generation}`,
        { idOffset: generation * 10 },
      );
      const current = createWorkspaceParseIndex(
        createParseIndexSource([note]),
        previous,
      );
      current.getParsedNote(note.id);
      previous = current;
    }

    expect([...previous.parseCache.entriesById.keys()]).toEqual(["note-1000"]);
    expect(Object.keys(previous)).not.toContain("previousIndex");
  });
});
