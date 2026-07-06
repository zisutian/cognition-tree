import { describe, expect, it } from "vitest";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
  createNoteTreeFolderNode,
  findFolderIdContainingNote,
} from "../../../src/workspace/model/noteTree";
import {
  createInitialWorkspaceData,
  createNoteRecord,
  type WorkspaceData,
} from "../../../src/workspace/model/workspaceData";
import { createWorkspaceStructureIndex } from "../../../src/workspace/indexes/workspaceStructureIndex";
import {
  createWorkspaceFolder,
  createWorkspaceNote,
  deleteWorkspaceFolder,
  deleteWorkspaceNote,
  moveWorkspaceNote,
  renameWorkspaceFolder,
  updateWorkspaceNoteSource,
} from "../../../src/workspace/commands/workspaceCommands";

const timestamp = "2026-06-08T00:00:00.000Z";

function createWorkspaceWithNotes(): WorkspaceData {
  const firstNote = createNoteRecord("note-first", "第一篇", timestamp);
  const secondNote = createNoteRecord("note-second", "第二篇", timestamp);
  const workspace = createInitialWorkspaceData();

  return {
    ...workspace,
    notes: [firstNote, secondNote],
    tree: appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree(workspace.tree, firstNote.id, "folder-inbox"),
      secondNote.id,
      "folder-inbox",
    ),
  };
}

function indexWorkspace(workspace: WorkspaceData) {
  return createWorkspaceStructureIndex(workspace);
}

describe("workspace actions", () => {
  it("creates notes in the target folder", () => {
    const workspace = {
      ...createInitialWorkspaceData(),
      tree: appendFolderToWorkspaceTree(
        createInitialWorkspaceData().tree,
        createNoteTreeFolderNode("folder-target", "目标"),
        "folder-inbox",
      ),
    };
    const nextWorkspace = createWorkspaceNote(indexWorkspace(workspace), {
      folderId: "folder-target",
      noteId: "note-new",
      timestamp,
    });

    expect(nextWorkspace.notes[0]).toMatchObject({
      id: "note-new",
      source: "",
      title: "未命名笔记",
    });
    expect(findFolderIdContainingNote(nextWorkspace.tree, "note-new")).toBe(
      "folder-target",
    );
  });

  it("deletes notes without owning active note selection", () => {
    const workspace = createWorkspaceWithNotes();
    const nextWorkspace = deleteWorkspaceNote(
      indexWorkspace(workspace),
      "note-second",
    );

    expect(nextWorkspace.notes.map((note) => note.id)).toEqual(["note-first"]);
    expect(
      findFolderIdContainingNote(nextWorkspace.tree, "note-second"),
    ).toBeNull();
  });

  it("creates, renames, deletes folders and removes nested notes", () => {
    const workspace = createWorkspaceWithNotes();
    const withFolder = createWorkspaceFolder(indexWorkspace(workspace), {
      folderId: "folder-target",
      parentFolderId: "folder-inbox",
      title: "  目标  ",
    });
    const renamed = renameWorkspaceFolder(
      indexWorkspace(withFolder),
      "folder-target",
      "资料",
    );
    const moved = moveWorkspaceNote(
      indexWorkspace(renamed),
      "note-second",
      "folder-target",
    );
    const deleted = deleteWorkspaceFolder(
      indexWorkspace(moved),
      "folder-target",
    );

    expect(JSON.stringify(renamed.tree)).toContain("资料");
    expect(findFolderIdContainingNote(moved.tree, "note-second")).toBe(
      "folder-target",
    );
    expect(deleted.notes.map((note) => note.id)).toEqual(["note-first"]);
    expect(
      findFolderIdContainingNote(deleted.tree, "note-second"),
    ).toBeNull();
  });

  it("updates note source by explicit note id", () => {
    const workspace = createWorkspaceWithNotes();
    const updatedSourceWorkspace = updateWorkspaceNoteSource(
      indexWorkspace(workspace),
      "note-first",
      "新标题\n\t: 定义",
      "2026-06-08T01:00:00.000Z",
    );

    expect(updatedSourceWorkspace.notes[0]).toMatchObject({
      source: "新标题\n\t: 定义",
      title: "新标题",
      updatedAt: "2026-06-08T01:00:00.000Z",
    });
  });

  it("rejects invalid workspace command input", () => {
    const workspace = createWorkspaceWithNotes();

    expect(() =>
      createWorkspaceNote(indexWorkspace(workspace), {
        folderId: "missing-folder",
        noteId: "note-new",
        timestamp,
      }),
    ).toThrow("Workspace folder does not exist");
    expect(() =>
      createWorkspaceFolder(indexWorkspace(workspace), {
        folderId: "folder-target",
        parentFolderId: "missing-folder",
        title: "目标",
      }),
    ).toThrow("Workspace folder does not exist");
    expect(() =>
      createWorkspaceFolder(indexWorkspace(workspace), {
        folderId: "folder-target",
        parentFolderId: "folder-inbox",
        title: "   ",
      }),
    ).toThrow("Workspace folder title is required");
    expect(() =>
      renameWorkspaceFolder(indexWorkspace(workspace), "missing-folder", "资料"),
    ).toThrow("Workspace folder does not exist");
    expect(() =>
      deleteWorkspaceNote(indexWorkspace(workspace), "missing-note"),
    ).toThrow("Workspace note does not exist");
    expect(() =>
      deleteWorkspaceFolder(indexWorkspace(workspace), "folder-inbox"),
    ).toThrow("Default workspace folder cannot be deleted");
    expect(() =>
      moveWorkspaceNote(
        indexWorkspace(workspace),
        "note-second",
        "missing-folder",
      ),
    ).toThrow("Workspace folder does not exist");
    expect(() =>
      updateWorkspaceNoteSource(
        indexWorkspace(workspace),
        "missing-note",
        "内容",
        timestamp,
      ),
    ).toThrow("Workspace note does not exist");
  });
});
