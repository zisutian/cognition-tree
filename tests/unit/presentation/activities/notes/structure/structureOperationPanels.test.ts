import { describe, expect, it } from "vitest";
import type {
  UiBlockNode,
} from "../../../../../../application/workspace/projection/viewBlocks";
import {
  getStructureOperationDirectoryNoteStatus,
} from "../../../../../../presentation/activities/notes/structure/StructureOperationContext";
import { createStructureBlockMoveOptions } from "../../../../../../presentation/activities/notes/structure/StructureBlockMoveQuickPick";
import { resolveStructureMoveIntent, structureContentKey } from "../../../../../../presentation/activities/notes/structure/structureMoveIntent";

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

  it("keeps stable identities when current lines change and rejects self or descendant drops", () => {
    const roots = [block("source", 8, [block("child", 9)]), block("target", 12)];
    const context = {
      canMutate: true, repositoryId: "repo", sourceNoteId: "note", targetNoteId: "note",
      sourceTreeId: "within", targetTreeId: "within", sourceRoots: roots, targetRoots: roots,
    };
    const identity = { repositoryId: "repo", sourceNoteId: "note", targetNoteId: "note" };
    expect(resolveStructureMoveIntent({
      sessionId: "test", source: { treeId: "within", contentKey: structureContentKey("repo", "note"), nodeIds: ["source"] },
      target: { treeId: "within", contentKey: structureContentKey("repo", "note"), nodeId: "target", position: "before" },
    }, context, identity)).toEqual({ sourceBlockIds: ["source"], target: { kind: "above", targetBlockId: "target" } });
    expect(resolveStructureMoveIntent({
      sessionId: "test", source: { treeId: "within", contentKey: structureContentKey("repo", "note"), nodeIds: ["source"] },
      target: { treeId: "within", contentKey: structureContentKey("repo", "note"), nodeId: "child", position: "inside" },
    }, context, identity)).toBeNull();
    expect(resolveStructureMoveIntent({
      sessionId: "test", source: { treeId: "within", contentKey: structureContentKey("repo", "note"), nodeIds: ["missing"] },
      target: { treeId: "within", contentKey: structureContentKey("repo", "note"), position: "root-end" },
    }, context, identity)).toBeNull();
    expect(resolveStructureMoveIntent({
      sessionId: "test", source: { treeId: "within", contentKey: structureContentKey("repo", "note"), nodeIds: ["source"] },
      target: { treeId: "within", contentKey: structureContentKey("repo", "note"), position: "root-end" },
    }, { ...context, canMutate: false }, identity)).toBeNull();
    expect(resolveStructureMoveIntent({
      sessionId: "test", source: { treeId: "within", contentKey: structureContentKey("repo", "note"), nodeIds: ["source"] },
      target: { treeId: "within", contentKey: structureContentKey("repo", "note"), nodeId: "target", position: "after" },
    }, { ...context, sourceRoots: [block("source", 18)], targetRoots: [block("target", 22)] }, identity))
      .toEqual({ sourceBlockIds: ["source"], target: { kind: "below", targetBlockId: "target" } });
  });

  it("rejects stale documents and cross-tree copies of the same note while allowing an empty target root", () => {
    const context = {
      canMutate: true, repositoryId: "repo", sourceNoteId: "source-note", targetNoteId: "target-note",
      sourceTreeId: "source-tree", targetTreeId: "target-tree",
      sourceRoots: [block("source", 4)], targetRoots: [],
    };
    const request = {
      sessionId: "test", source: { treeId: "source-tree", contentKey: structureContentKey("repo", "source-note"), nodeIds: ["source"] },
      target: { treeId: "target-tree", contentKey: structureContentKey("repo", "target-note"), position: "root-end" as const },
    };
    const identity = { repositoryId: "repo", sourceNoteId: "source-note", targetNoteId: "target-note" };
    expect(resolveStructureMoveIntent(request, context, identity))
      .toEqual({ sourceBlockIds: ["source"], target: { kind: "end" } });
    expect(resolveStructureMoveIntent(request, { ...context, targetNoteId: "new-target" }, identity)).toBeNull();
    expect(resolveStructureMoveIntent(request, { ...context, targetNoteId: "source-note" },
      { ...identity, targetNoteId: "source-note" })).toBeNull();
    expect(resolveStructureMoveIntent(request, { ...context, targetNoteId: null },
      { ...identity, targetNoteId: null })).toBeNull();
  });

  it("uses the same ID-based destinations for the move menu", () => {
    const options = createStructureBlockMoveOptions({
      targetContentKey: structureContentKey("repo", "note"),
      session: { sessionId: "test", source: { treeId: "within", contentKey: structureContentKey("repo", "note"), nodeIds: ["source"] } },
      canDrop: (request) => request.target.position === "root-end" || !["source", "child"].includes(request.target.nodeId),
      nodes: [block("source", 1, [block("child", 2)]), block("target", 3)],
      targetTreeId: "within",
    });
    expect(options.map((option) => option.target)).toEqual([
      { treeId: "within", contentKey: structureContentKey("repo", "note"), nodeId: "target", position: "before" },
      { treeId: "within", contentKey: structureContentKey("repo", "note"), nodeId: "target", position: "inside" },
      { treeId: "within", contentKey: structureContentKey("repo", "note"), nodeId: "target", position: "after" },
      { treeId: "within", contentKey: structureContentKey("repo", "note"), position: "root-end" },
    ]);
  });
  it("keeps the complete framework batch and rejects one missing source or stale content identity", () => {
    const roots = [block("one", 2), block("middle", 3), block("last", 4)];
    const context = {
      canMutate: true, repositoryId: "repo", sourceNoteId: "note", targetNoteId: "note",
      sourceTreeId: "within", targetTreeId: "within", sourceRoots: roots, targetRoots: roots,
    };
    const request = {
      sessionId: "test", source: { treeId: "within", contentKey: structureContentKey("repo", "note"), nodeIds: ["one", "last"] },
      target: { treeId: "within", contentKey: structureContentKey("repo", "note"), nodeId: "middle", position: "after" as const },
    };
    expect(resolveStructureMoveIntent(request, context, context)).toEqual({
      sourceBlockIds: ["one", "last"], target: { kind: "below", targetBlockId: "middle" },
    });
    expect(resolveStructureMoveIntent({ ...request, source: { ...request.source, nodeIds: ["one", "missing"] } }, context, context)).toBeNull();
    expect(resolveStructureMoveIntent({ ...request, target: { ...request.target, contentKey: structureContentKey("other-repo", "note") } }, context, context)).toBeNull();
  });

});
