import { describe, expect, it } from "vitest";
import type {
  UiBlockNode,
} from "../../../../../../application/workspace/projection/viewBlocks";
import {
  getStructureOperationDirectoryNoteStatus,
} from "../../../../../../presentation/activities/notes/structure/StructureOperationContext";
import { createStructureBlockMoveOptions } from "../../../../../../presentation/activities/notes/structure/StructureBlockMoveQuickPick";
import { resolveStructureMoveIntent } from "../../../../../../presentation/activities/notes/structure/structureMoveIntent";

describe("structure operation panels", () => {
  it("hides stale target status while selecting a new structure operation target", () => {
    expect(
      getStructureOperationDirectoryNoteStatus({
        mode: "betweenNotes",
        noteId: "note-source",
        pairSelectionPhase: "selectSource",
        sourceNoteId: "note-source",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("source");
    expect(
      getStructureOperationDirectoryNoteStatus({
        mode: "betweenNotes",
        noteId: "note-target",
        pairSelectionPhase: "selectSource",
        sourceNoteId: "note-source",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("target");
    expect(
      getStructureOperationDirectoryNoteStatus({
        mode: "betweenNotes",
        noteId: "note-target",
        pairSelectionPhase: "selectTarget",
        sourceNoteId: "note-neutral",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("");
    expect(
      getStructureOperationDirectoryNoteStatus({
        mode: "betweenNotes",
        noteId: "note-neutral",
        pairSelectionPhase: "selectTarget",
        sourceNoteId: "note-neutral",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("source");
  });

  it("keeps structure status separate from source and target status", () => {
    expect(
      getStructureOperationDirectoryNoteStatus({
        mode: "withinNote",
        noteId: "note-source",
        pairSelectionPhase: "selectSource",
        sourceNoteId: "note-source",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("structure");
    expect(
      getStructureOperationDirectoryNoteStatus({
        mode: "withinNote",
        noteId: "note-target",
        pairSelectionPhase: "selectSource",
        sourceNoteId: "note-source",
        structureNoteId: "note-source",
        targetNoteId: "note-target",
      }),
    ).toBe("");
  });

  const block = (id: string, lineNumber: number, children: UiBlockNode[] = []): UiBlockNode => ({
    id, lineNumber, children, diagnostics: [], label: "组分", lineLabel: `L${lineNumber}`,
    textDisplay: { displayText: id, segments: [{ id, kind: "text", text: id }], textColor: "default" },
  });

  it("resolves stable IDs against current lines and rejects self or descendant drops", () => {
    const roots = [block("source", 8, [block("child", 9)]), block("target", 12)];
    const context = {
      canMutate: true, repositoryId: "repo", sourceNoteId: "note", targetNoteId: "note",
      sourceTreeId: "within", targetTreeId: "within", sourceRoots: roots, targetRoots: roots,
    };
    const identity = { repositoryId: "repo", sourceNoteId: "note", targetNoteId: "note" };
    expect(resolveStructureMoveIntent({
      source: { treeId: "within", nodeId: "source" },
      target: { treeId: "within", nodeId: "target", position: "before" },
    }, context, identity)).toEqual({ sourceLine: "8", targetPosition: "sibling-above:12" });
    expect(resolveStructureMoveIntent({
      source: { treeId: "within", nodeId: "source" },
      target: { treeId: "within", nodeId: "child", position: "inside" },
    }, context, identity)).toBeNull();
    expect(resolveStructureMoveIntent({
      source: { treeId: "within", nodeId: "missing" },
      target: { treeId: "within", position: "root-end" },
    }, context, identity)).toBeNull();
    expect(resolveStructureMoveIntent({
      source: { treeId: "within", nodeId: "source" },
      target: { treeId: "within", position: "root-end" },
    }, { ...context, canMutate: false }, identity)).toBeNull();
    expect(resolveStructureMoveIntent({
      source: { treeId: "within", nodeId: "source" },
      target: { treeId: "within", nodeId: "target", position: "after" },
    }, { ...context, sourceRoots: [block("source", 18)], targetRoots: [block("target", 22)] }, identity))
      .toEqual({ sourceLine: "18", targetPosition: "sibling-below:22" });
  });

  it("rejects stale documents and cross-tree copies of the same note while allowing an empty target root", () => {
    const context = {
      canMutate: true, repositoryId: "repo", sourceNoteId: "source-note", targetNoteId: "target-note",
      sourceTreeId: "source-tree", targetTreeId: "target-tree",
      sourceRoots: [block("source", 4)], targetRoots: [],
    };
    const request = {
      source: { treeId: "source-tree", nodeId: "source" },
      target: { treeId: "target-tree", position: "root-end" as const },
    };
    const identity = { repositoryId: "repo", sourceNoteId: "source-note", targetNoteId: "target-note" };
    expect(resolveStructureMoveIntent(request, context, identity))
      .toEqual({ sourceLine: "4", targetPosition: "end" });
    expect(resolveStructureMoveIntent(request, { ...context, targetNoteId: "new-target" }, identity)).toBeNull();
    expect(resolveStructureMoveIntent(request, { ...context, targetNoteId: "source-note" },
      { ...identity, targetNoteId: "source-note" })).toBeNull();
    expect(resolveStructureMoveIntent(request, { ...context, targetNoteId: null },
      { ...identity, targetNoteId: null })).toBeNull();
  });

  it("uses the same ID-based destinations for the move menu", () => {
    const options = createStructureBlockMoveOptions({
      blockedIds: new Set(["source", "child"]),
      nodes: [block("source", 1, [block("child", 2)]), block("target", 3)],
      targetTreeId: "within",
    });
    expect(options.map((option) => option.target)).toEqual([
      { treeId: "within", nodeId: "target", position: "before" },
      { treeId: "within", nodeId: "target", position: "inside" },
      { treeId: "within", nodeId: "target", position: "after" },
      { treeId: "within", position: "root-end" },
    ]);
  });
});
