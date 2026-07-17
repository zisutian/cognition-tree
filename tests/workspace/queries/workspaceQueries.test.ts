import { describe, expect, it } from "vitest";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
} from "../../../src/workspace/model/noteTree/mutations";
import { createNoteTreeFolderNode } from "../../../src/workspace/model/noteTree/create";
import {
  createInitialWorkspaceData,
  type NoteRecord,
  type WorkspaceData,
} from "../../../src/workspace/model/workspaceData";
import { defaultCtnSyntaxProfile } from "../../../ctn/syntax/defaultSyntaxProfile";
import { createWorkspaceParseIndex } from "../../../src/workspace/indexes/workspaceParseIndex";
import { createWorkspaceStructureIndex } from "../../../src/workspace/indexes/workspaceStructureIndex";
import {
  findWorkspaceFolderIdContainingNote,
  findWorkspaceNote,
  getParsedWorkspaceNote,
  getWorkspaceTree,
  hasWorkspaceNote,
  listWorkspaceNotes,
} from "../../../src/workspace/queries/workspaceQueries";
import {
  createCanonicalTestNote,
  createWorkspaceDataWithNotes,
} from "../workspaceTestFixture";

function createWorkspace(): WorkspaceData {
  const sourceNote = createCanonicalTestNote("note-source", "源笔记");
  const targetNote = createCanonicalTestNote("note-target", "目标笔记", {
    idOffset: 100,
  });
  const workspace = createInitialWorkspaceData();
  const treeWithFolder = appendFolderToWorkspaceTree(
    workspace.tree,
    createNoteTreeFolderNode("folder-project", "项目"),
    null,
  );

  return {
    ...workspace,
    notes: [sourceNote, targetNote],
    tree: appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree(treeWithFolder, sourceNote.id, null),
      targetNote.id,
      "folder-project",
    ),
  };
}

function indexWorkspace(workspace: WorkspaceData) {
  return createWorkspaceStructureIndex(workspace);
}

function createParseIndex(notes: NoteRecord[]) {
  return createWorkspaceParseIndex({
    syntaxProfile: defaultCtnSyntaxProfile,
    workspace: indexWorkspace(createWorkspaceDataWithNotes(notes)),
  });
}

describe("workspace queries", () => {
  it("reads derived notes through workspace-level query names", () => {
    const workspaceData = createWorkspace();
    const workspace = indexWorkspace(workspaceData);

    expect(listWorkspaceNotes(workspace).map((note) => note.id)).toEqual([
      "note-source",
      "note-target",
    ]);
    expect(getWorkspaceTree(workspace)).toBe(workspaceData.tree);
    expect(findWorkspaceNote(workspace, "note-source")).toMatchObject({
      id: "note-source",
      title: "源笔记",
    });
    expect(hasWorkspaceNote(workspace, "missing-note")).toBe(false);
  });

  it("resolves note placement from the workspace tree", () => {
    const workspace = indexWorkspace(createWorkspace());

    expect(findWorkspaceFolderIdContainingNote(workspace, "note-target")).toBe(
      "folder-project",
    );
    expect(findWorkspaceFolderIdContainingNote(workspace, "note-source")).toBeNull();
  });

  it("reads parsed notes and returns null for missing selection", () => {
    const note = createCanonicalTestNote(
      "note-first",
      "标题\n概念\n\t: 定义",
    );
    const index = createParseIndex([note]);

    expect(
      getParsedWorkspaceNote(index, note.id)?.document.blocks.map(
        (block) => block.label,
      ),
    ).toEqual(["标题", "顶格概念", "定义"]);
    expect(getParsedWorkspaceNote(index, null)).toBeNull();
    expect(getParsedWorkspaceNote(index, "missing-note")).toBeNull();
  });

});
