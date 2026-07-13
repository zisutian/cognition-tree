import { describe, expect, it } from "vitest";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
} from "../../../src/workspace/model/noteTree/mutations";
import {
  createNoteTreeFolderNode,
} from "../../../src/workspace/model/noteTree/create";
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
  moveWorkspaceTreeNode,
  renameWorkspaceFolder,
  renameWorkspaceNote,
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
      appendNoteToWorkspaceTree(workspace.tree, firstNote.id, null),
      secondNote.id,
      null,
    ),
  };
}

function indexWorkspace(workspace: WorkspaceData) {
  return createWorkspaceStructureIndex(workspace);
}

function findFolderIdContainingNote(workspace: WorkspaceData, noteId: string) {
  return indexWorkspace(workspace).noteFolderIdById.get(noteId) ?? null;
}

describe("workspace actions", () => {
  it("creates notes in the target folder", () => {
    const workspace = {
      ...createInitialWorkspaceData(),
      tree: appendFolderToWorkspaceTree(
        createInitialWorkspaceData().tree,
        createNoteTreeFolderNode("folder-target", "目标"),
        null,
      ),
    };
    const nextWorkspace = createWorkspaceNote(indexWorkspace(workspace), {
      noteId: "note-new",
      parentFolderId: "folder-target",
      timestamp,
    });

    expect(nextWorkspace.notes[0]).toMatchObject({
      id: "note-new",
      source: "未命名笔记",
      title: "未命名笔记",
    });
    expect(findFolderIdContainingNote(nextWorkspace, "note-new")).toBe(
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
      findFolderIdContainingNote(nextWorkspace, "note-second"),
    ).toBeNull();
  });

  it("creates, renames, deletes folders and removes nested notes", () => {
    const workspace = createWorkspaceWithNotes();
    const withFolder = createWorkspaceFolder(indexWorkspace(workspace), {
      folderId: "folder-target",
      parentFolderId: null,
      title: "  目标  ",
    });
    const renamed = renameWorkspaceFolder(
      indexWorkspace(withFolder),
      "folder-target",
      "资料",
    );
    const moved = moveWorkspaceTreeNode(indexWorkspace(renamed), {
      placement: "inside",
      source: { kind: "note", noteId: "note-second" },
      target: { folderId: "folder-target", kind: "folder" },
    });
    const deleted = deleteWorkspaceFolder(
      indexWorkspace(moved),
      "folder-target",
    );

    expect(JSON.stringify(renamed.tree)).toContain("资料");
    expect(findFolderIdContainingNote(moved, "note-second")).toBe(
      "folder-target",
    );
    expect(deleted.notes.map((note) => note.id)).toEqual(["note-first"]);
    expect(
      findFolderIdContainingNote(deleted, "note-second"),
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

  it("renames notes by updating the fixed title line", () => {
    const workspace = updateWorkspaceNoteSource(
      indexWorkspace(createWorkspaceWithNotes()),
      "note-first",
      "旧标题\n\t: 定义",
      "2026-06-08T01:00:00.000Z",
    );
    const renamed = renameWorkspaceNote(
      indexWorkspace(workspace),
      "note-first",
      "  新标题  ",
      "2026-06-08T02:00:00.000Z",
    );

    expect(renamed.notes[0]).toMatchObject({
      source: "新标题\n\t: 定义",
      title: "新标题",
      updatedAt: "2026-06-08T02:00:00.000Z",
    });
  });

  it("renames notes with blank source by writing the title line", () => {
    const workspace = {
      ...createInitialWorkspaceData(),
      notes: [
        {
          createdAt: timestamp,
          id: "note-new",
          source: "",
          title: "",
          updatedAt: timestamp,
        },
      ],
      tree: appendNoteToWorkspaceTree([], "note-new", null),
    };
    const renamed = renameWorkspaceNote(
      indexWorkspace(workspace),
      "note-new",
      "新笔记",
      "2026-06-08T02:00:00.000Z",
    );

    expect(renamed.notes[0]).toMatchObject({
      source: "新笔记",
      title: "新笔记",
      updatedAt: "2026-06-08T02:00:00.000Z",
    });
  });

  it("moves sidebar tree nodes within or across folders", () => {
    const workspace = createWorkspaceWithNotes();
    const movedBeforeNote = moveWorkspaceTreeNode(indexWorkspace(workspace), {
      placement: "before",
      source: { kind: "note", noteId: "note-second" },
      target: { kind: "note", noteId: "note-first" },
    });
    const withFolder = createWorkspaceFolder(indexWorkspace(movedBeforeNote), {
      folderId: "folder-target",
      parentFolderId: null,
      title: "目标",
    });
    const movedInsideFolder = moveWorkspaceTreeNode(indexWorkspace(withFolder), {
      placement: "inside",
      source: { kind: "note", noteId: "note-first" },
      target: { folderId: "folder-target", kind: "folder" },
    });
    expect(movedInsideFolder.tree.map((node) => node.id)).toEqual([
      "tree-note-second",
      "folder-target",
    ]);
    expect(
      findFolderIdContainingNote(movedInsideFolder, "note-first"),
    ).toBe("folder-target");
  });

  it("rejects invalid workspace command input", () => {
    const workspace = createWorkspaceWithNotes();

    expect(() =>
      createWorkspaceNote(indexWorkspace(workspace), {
        noteId: "note-new",
        parentFolderId: "missing-folder",
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
        parentFolderId: null,
        title: "   ",
      }),
    ).toThrow("Workspace folder title is required");
    expect(() =>
      renameWorkspaceFolder(indexWorkspace(workspace), "missing-folder", "资料"),
    ).toThrow("Workspace folder does not exist");
    expect(() =>
      renameWorkspaceNote(
        indexWorkspace(workspace),
        "note-first",
        "   ",
        timestamp,
      ),
    ).toThrow("Workspace note title is required");
    expect(() =>
      renameWorkspaceNote(
        indexWorkspace(workspace),
        "missing-note",
        "新标题",
        timestamp,
      ),
    ).toThrow("Workspace note does not exist");
    expect(() =>
      deleteWorkspaceNote(indexWorkspace(workspace), "missing-note"),
    ).toThrow("Workspace note does not exist");
    expect(() =>
      deleteWorkspaceFolder(indexWorkspace(workspace), "missing-folder"),
    ).toThrow("Workspace folder does not exist");
    expect(() =>
      updateWorkspaceNoteSource(
        indexWorkspace(workspace),
        "missing-note",
        "内容",
        timestamp,
      ),
    ).toThrow("Workspace note does not exist");
    expect(() =>
      moveWorkspaceTreeNode(indexWorkspace(workspace), {
        placement: "after",
        source: { kind: "note", noteId: "missing-note" },
        target: { kind: "note", noteId: "note-first" },
      }),
    ).toThrow("Workspace tree node does not exist");
  });
});
