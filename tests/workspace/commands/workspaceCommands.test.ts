import { describe, expect, it } from "vitest";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
  createFolderTreeNode,
  findFolderIdContainingNote,
} from "../../../src/workspace/model/noteTree";
import {
  createInitialWorkspaceData,
  createNoteRecord,
  type WorkspaceData,
} from "../../../src/workspace/model/workspaceData";
import {
  createWorkspaceFolder,
  createWorkspaceNote,
  deleteWorkspaceFolder,
  deleteWorkspaceNote,
  moveWorkspaceNote,
  renameWorkspaceFolder,
  selectWorkspaceNote,
  updateActiveWorkspaceNoteSource,
} from "../../../src/workspace/commands/workspaceCommands";

const timestamp = "2026-06-08T00:00:00.000Z";

function createWorkspaceWithNotes(): WorkspaceData {
  const firstNote = createNoteRecord("note-first", "第一篇", timestamp);
  const secondNote = createNoteRecord("note-second", "第二篇", timestamp);
  const workspace = createInitialWorkspaceData();

  return {
    ...workspace,
    activeNoteId: firstNote.id,
    notes: [firstNote, secondNote],
    tree: appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree(workspace.tree, firstNote.id, "folder-inbox"),
      secondNote.id,
      "folder-inbox",
    ),
  };
}

describe("workspace actions", () => {
  it("creates notes in the target folder", () => {
    const workspace = {
      ...createInitialWorkspaceData(),
      tree: appendFolderToWorkspaceTree(
        createInitialWorkspaceData().tree,
        createFolderTreeNode("folder-target", "目标"),
        "folder-inbox",
      ),
    };
    const nextWorkspace = createWorkspaceNote(workspace, {
      folderId: "folder-target",
      noteId: "note-new",
      timestamp,
    });

    expect(nextWorkspace.activeNoteId).toBe("note-new");
    expect(nextWorkspace.notes[0]).toMatchObject({
      id: "note-new",
      source: "",
      title: "未命名笔记",
    });
    expect(findFolderIdContainingNote(nextWorkspace.tree, "note-new")).toBe(
      "folder-target",
    );
  });

  it("selects and deletes notes while keeping activeNote valid", () => {
    const workspace = createWorkspaceWithNotes();
    const selectedWorkspace = selectWorkspaceNote(workspace, "note-second");

    expect(selectedWorkspace.activeNoteId).toBe("note-second");

    const nextWorkspace = deleteWorkspaceNote(selectedWorkspace, "note-second");

    expect(nextWorkspace.activeNoteId).toBe("note-first");
    expect(nextWorkspace.notes.map((note) => note.id)).toEqual(["note-first"]);
    expect(
      findFolderIdContainingNote(nextWorkspace.tree, "note-second"),
    ).toBeNull();
  });

  it("creates, renames, deletes folders and removes nested notes", () => {
    const workspace = createWorkspaceWithNotes();
    const withFolder = createWorkspaceFolder(workspace, {
      folderId: "folder-target",
      parentFolderId: "folder-inbox",
      title: "  目标  ",
    });
    const renamed = renameWorkspaceFolder(withFolder, "folder-target", "资料");
    const moved = moveWorkspaceNote(renamed, "note-second", "folder-target");
    const deleted = deleteWorkspaceFolder(moved, "folder-target");

    expect(JSON.stringify(renamed.tree)).toContain("资料");
    expect(findFolderIdContainingNote(moved.tree, "note-second")).toBe(
      "folder-target",
    );
    expect(deleted.notes.map((note) => note.id)).toEqual(["note-first"]);
    expect(
      findFolderIdContainingNote(deleted.tree, "note-second"),
    ).toBeNull();
  });

  it("updates active note source", () => {
    const workspace = createWorkspaceWithNotes();
    const updatedSourceWorkspace = updateActiveWorkspaceNoteSource(
      workspace,
      "新标题\n\t: 定义",
      "2026-06-08T01:00:00.000Z",
    );

    expect(updatedSourceWorkspace.notes[0]).toMatchObject({
      source: "新标题\n\t: 定义",
      title: "新标题",
      updatedAt: "2026-06-08T01:00:00.000Z",
    });
  });
});
