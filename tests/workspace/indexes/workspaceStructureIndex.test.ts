import { describe, expect, it } from "vitest";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
  createNoteTreeFolderNode,
} from "../../../src/workspace/model/noteTree";
import {
  createInitialWorkspaceData,
  createNoteRecord,
} from "../../../src/workspace/model/workspaceData";
import { createWorkspaceStructureIndex } from "../../../src/workspace/indexes/workspaceStructureIndex";

const timestamp = "2026-07-04T00:00:00.000Z";

function createWorkspaceData() {
  const firstNote = createNoteRecord("note-first", "First", timestamp);
  const secondNote = createNoteRecord("note-second", "Second", timestamp);
  const thirdNote = createNoteRecord("note-third", "Third", timestamp);
  const workspace = createInitialWorkspaceData();
  const treeWithFolders = appendFolderToWorkspaceTree(
    appendFolderToWorkspaceTree(
      workspace.tree,
      createNoteTreeFolderNode("folder-project", "Project"),
      "folder-inbox",
    ),
    createNoteTreeFolderNode("folder-child", "Child"),
    "folder-project",
  );

  return {
    ...workspace,
    notes: [firstNote, secondNote, thirdNote],
    tree: appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree(
        appendNoteToWorkspaceTree(treeWithFolders, firstNote.id, "folder-inbox"),
        secondNote.id,
        "folder-project",
      ),
      thirdNote.id,
      "folder-child",
    ),
  };
}

describe("createWorkspaceStructureIndex", () => {
  it("indexes workspace notes, folders, positions and folder membership", () => {
    const workspace = createWorkspaceData();
    const index = createWorkspaceStructureIndex(workspace);

    expect(index.data).toBe(workspace);
    expect(index.noteById.get("note-second")?.title).toBe("Second");
    expect(index.noteIndexById.get("note-third")).toBe(2);
    expect(index.folderById.get("folder-project")?.title).toBe("Project");
    expect(index.folderCount).toBe(3);
    expect(index.noteFolderIdById.get("note-first")).toBe("folder-inbox");
    expect(index.noteFolderIdById.get("note-third")).toBe("folder-child");
    expect(index.noteIdsByFolderId.get("folder-project")).toEqual([
      "note-third",
      "note-second",
    ]);
  });

  it("returns empty lookup results for missing ids", () => {
    const index = createWorkspaceStructureIndex(createWorkspaceData());

    expect(index.noteById.get("missing-note")).toBeUndefined();
    expect(index.noteIndexById.get("missing-note")).toBeUndefined();
    expect(index.folderById.get("missing-folder")).toBeUndefined();
    expect(index.noteFolderIdById.get("missing-note")).toBeUndefined();
    expect(index.noteIdsByFolderId.get("missing-folder")).toBeUndefined();
  });
});
