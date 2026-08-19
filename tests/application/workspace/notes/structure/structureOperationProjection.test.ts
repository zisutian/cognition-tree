import { describe, expect, it } from "vitest";
import { createStructureOperationProjection } from "../../../../../application/workspace/notes/structure/structureOperationProjection";
import { defaultCtnSyntax } from "../../../../../core/ctn/syntax/defaultSyntax";
import { createWorkspaceParseIndex } from "../../../../../core/workspace/indexes/workspaceParseIndex";
import { createWorkspaceStructureIndex } from "../../../../../core/workspace/indexes/workspaceStructureIndex";
import { listWorkspaceNotes } from "../../../../../core/workspace/queries/workspaceQueries";
import {
  createCanonicalTestNote,
} from "../../../../core/workspace/workspaceTestFixture";

function createProjectionSource() {
  const sourceNote = createCanonicalTestNote(
    "source",
    "Source\n- Source root\n\t: Source child",
  );
  const targetNote = createCanonicalTestNote(
    "target",
    "Target\n- Target root",
    { idOffset: 100 },
  );
  const structureNote = createCanonicalTestNote(
    "structure",
    "Structure\n? Structure root\n\t: Structure child",
    { idOffset: 200 },
  );
  const workspace = createWorkspaceStructureIndex({
    id: "workspace",
    name: "Workspace",
    notes: [sourceNote, targetNote, structureNote],
    tree: [
      { kind: "note", noteId: sourceNote.id },
      {
        children: [
          { kind: "note", noteId: targetNote.id },
          { kind: "note", noteId: structureNote.id },
        ],
        folderId: "folder",
        kind: "folder",
        title: "Folder",
      },
    ],
  });
  const index = createWorkspaceParseIndex({
    syntax: defaultCtnSyntax,
    workspace,
  });

  return {
    analysis: {
      index,
      parsedNotesById: new Map([
        [sourceNote.id, index.getParsedNote(sourceNote.id)!],
      ]),
    },
    notes: listWorkspaceNotes(workspace),
    sourceNoteId: sourceNote.id,
    structureNoteId: structureNote.id,
    targetNoteId: targetNote.id,
    workspace,
  };
}

function blockTexts(
  blocks: ReturnType<typeof createStructureOperationProjection>["sourceBlocks"],
) {
  return blocks.map((block) => block.textDisplay.displayText);
}

describe("structure operation projection", () => {
  it("projects the directory, selected summaries and between-note block views", () => {
    const view = createStructureOperationProjection({
      ...createProjectionSource(),
      mode: "betweenNotes",
    });

    expect(view.noteTree).toMatchObject([
      { kind: "note", noteId: "source", title: "Source" },
      {
        childCount: 2,
        children: [
          { kind: "note", noteId: "target", title: "Target" },
          { kind: "note", noteId: "structure", title: "Structure" },
        ],
        folderId: "folder",
        kind: "folder",
      },
    ]);
    expect(view.sourceNote).toEqual({ id: "source", title: "Source" });
    expect(view.targetNote).toEqual({ id: "target", title: "Target" });
    expect(view.structureNote).toEqual({
      id: "structure",
      title: "Structure",
    });
    expect(blockTexts(view.sourceBlocks)).toEqual([
      "Source root",
      "Source child",
    ]);
    expect(blockTexts(view.sourceRoots)).toEqual(["Source root"]);
    expect(blockTexts(view.targetRoots)).toEqual(["Target root"]);
    expect(view.structureBlocks).toEqual([]);
    expect(view.structureRoots).toEqual([]);
  });

  it("projects only the within-note block views in within-note mode", () => {
    const view = createStructureOperationProjection({
      ...createProjectionSource(),
      mode: "withinNote",
    });

    expect(blockTexts(view.structureBlocks)).toEqual([
      "Structure root",
      "Structure child",
    ]);
    expect(blockTexts(view.structureRoots)).toEqual(["Structure root"]);
    expect(view.sourceBlocks).toEqual([]);
    expect(view.sourceRoots).toEqual([]);
    expect(view.targetRoots).toEqual([]);
  });

  it("keeps selection ids but emits no invented views without a workspace", () => {
    const source = createProjectionSource();
    const view = createStructureOperationProjection({
      ...source,
      mode: "betweenNotes",
      notes: [],
      workspace: null,
    });

    expect(view).toMatchObject({
      noteTree: [],
      sourceBlocks: [],
      sourceNote: null,
      sourceNoteId: "source",
      sourceRoots: [],
      structureBlocks: [],
      structureNote: null,
      structureNoteId: "structure",
      structureRoots: [],
      targetNote: null,
      targetNoteId: "target",
      targetRoots: [],
    });
  });
});
