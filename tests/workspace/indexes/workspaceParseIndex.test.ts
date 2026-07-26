import { describe, expect, it } from "vitest";
import { defaultCtnSyntax } from "../../../core/ctn/syntax/defaultSyntax";
import {
  compileCtnSyntaxDefinition,
} from "../../../core/ctn/syntax/compiler";
import type { CtnCompiledSyntax } from "../../../core/ctn/syntax/types";
import type { NoteRecord } from "../../../core/workspace/model/workspaceData";
import {
  createWorkspaceParseIndex,
} from "../../../core/workspace/indexes/workspaceParseIndex";
import { createWorkspaceStructureIndex } from "../../../core/workspace/indexes/workspaceStructureIndex";
import {
  createCanonicalTestNote,
  createCanonicalTestSource,
  createWorkspaceDataWithNotes,
} from "../workspaceTestFixture";

function createParseIndexSource(
  notes: NoteRecord[],
  syntax: CtnCompiledSyntax = defaultCtnSyntax,
) {
  return {
    syntax,
    workspace: createWorkspaceStructureIndex(createWorkspaceDataWithNotes(notes)),
  };
}

function scanReferenceGraph(index: ReturnType<typeof createWorkspaceParseIndex>) {
  const scan = index.createScan();

  scan.noteIds.forEach((noteId) => scan.scanNote(noteId));
  return scan.complete();
}

describe("createWorkspaceParseIndex", () => {
  it("owns one analysis per note and returns it without reparsing", () => {
    const note = createCanonicalTestNote("note-source", "Source [[Target]]");
    const index = createWorkspaceParseIndex(createParseIndexSource([note]));
    const analysis = index.parseCache.entriesById.get(note.id)?.analysis;

    expect(index.analysisStats).toEqual({
      analyzedNoteIds: [note.id],
      runCount: 1,
      updatedBlockIdOwnerIds: [note.id],
    });
    expect(index.parseCache.entriesById.size).toBe(1);
    expect(
      index.getParsedNote(note.id)?.analysis.document.blocks,
    ).toHaveLength(1);
    expect(index.getParsedNote(note.id)?.analysis).toBe(analysis);
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

    expect(index.parseCache.entriesById.size).toBe(2);
    const graph = scanReferenceGraph(index);

    expect(graph.edges).toEqual([
      expect.objectContaining({
        count: 1,
        sourceNoteId: source.id,
        targetNoteId: target.id,
      }),
    ]);
    expect(index.parseCache.entriesById.size).toBe(2);
    expect(scanReferenceGraph(index)).toBe(graph);
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

    expect(secondIndex.analysisStats).toEqual({
      analyzedNoteIds: [target.id],
      runCount: 1,
      updatedBlockIdOwnerIds: [target.id],
    });
    expect(secondIndex.getParsedNote(source.id)?.analysis.document).toBe(
      firstParsedSource?.analysis.document,
    );
    expect(secondIndex.getParsedNote(target.id)?.analysis.document).not.toBe(
      firstParsedTarget?.analysis.document,
    );
    expect(
      secondIndex.blockIdRegistry.blockIdsByOwner.get(source.id),
    ).toBe(firstIndex.blockIdRegistry.blockIdsByOwner.get(source.id));
    expect(
      secondIndex.blockIdRegistry.blockIdsByOwner.get(target.id),
    ).not.toBe(firstIndex.blockIdRegistry.blockIdsByOwner.get(target.id));
  });

  it("reuses unchanged note analyses between successive session indexes", () => {
    const note = createCanonicalTestNote("note-source", "Source");
    const source = createParseIndexSource([note]);
    const firstIndex = createWorkspaceParseIndex(source);
    const firstParsedNote = firstIndex.getParsedNote(note.id);

    const copiedSource = createParseIndexSource([{ ...note }]);
    const secondIndex = createWorkspaceParseIndex(copiedSource, firstIndex);

    expect(secondIndex.getParsedNote(note.id)?.analysis.sourceText).toBe(
      firstParsedNote?.analysis.sourceText,
    );
    expect(secondIndex.analysisStats.runCount).toBe(0);
    expect(secondIndex.blockIdRegistry).toBe(firstIndex.blockIdRegistry);
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

  it("reprojects unchanged sources without parsing when presentation changes", () => {
    const note = createCanonicalTestNote("note-source", "Source");
    const firstIndex = createWorkspaceParseIndex(createParseIndexSource([note]));
    const firstParsedNote = firstIndex.getParsedNote(note.id);
    const definition = structuredClone(defaultCtnSyntax.definition);
    definition.root!.label = "概念";
    const result = compileCtnSyntaxDefinition(definition, "workspace");
    if (!result.syntax) throw new Error("Invalid presentation test syntax");
    const secondIndex = createWorkspaceParseIndex(
      createParseIndexSource([note], result.syntax),
      firstIndex,
    );

    expect(secondIndex.getParsedNote(note.id)?.analysis.sourceText).toBe(
      firstParsedNote?.analysis.sourceText,
    );
    expect(
      secondIndex.getParsedNote(note.id)?.analysis.syntax.root?.label,
    ).toBe("概念");
    expect(secondIndex.analysisStats.runCount).toBe(0);
    expect(secondIndex.blockIdRegistry).toBe(firstIndex.blockIdRegistry);
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
