import { describe, expect, it } from "vitest";
import {
  createInitialWorkspaceData,
  createNoteRecord,
  type NoteTreeNode,
} from "../../../src/workspace/model/workspaceData";
import {
  appendNoteToWorkspaceTree,
  appendFolderToWorkspaceTree,
  collectNoteIdsInFolder,
  countFolders,
  createFolderTreeNode,
  findFolderIdContainingNote,
  findFirstFolderId,
  moveNoteInWorkspaceTree,
  orderNoteTreeNodesFoldersFirst,
  removeFolderFromWorkspaceTree,
  removeNoteFromWorkspaceTree,
  renameFolderInWorkspaceTree,
} from "../../../src/workspace/model/noteTree";

describe("note tree operations", () => {
  it("adds newly created notes to the inbox folder", () => {
    const workspace = createInitialWorkspaceData();
    const note = createNoteRecord(
      "note-new",
      "新笔记\n    : 本地保存",
      "2026-05-25T00:00:00.000Z",
    );
    const tree = appendNoteToWorkspaceTree(
      workspace.tree,
      note.id,
      "folder-inbox",
    );

    expect(tree[tree.length - 1]).toEqual({
      id: "folder-inbox",
      kind: "folder",
      title: "仓库根目录",
      children: [
        {
          id: "tree-note-new",
          kind: "note",
          noteId: "note-new",
        },
      ],
    });
  });

  it("adds newly created notes to a selected folder", () => {
    const tree: NoteTreeNode[] = [
      {
        id: "folder-inbox",
        kind: "folder",
        title: "仓库根目录",
        children: [],
      },
      {
        id: "folder-research",
        kind: "folder",
        title: "研究",
        children: [
          {
            id: "folder-research-child",
            kind: "folder",
            title: "子目录",
            children: [],
          },
        ],
      },
    ];

    expect(
      appendNoteToWorkspaceTree(tree, "note-new", "folder-research-child"),
    ).toEqual([
      tree[0],
      {
        id: "folder-research",
        kind: "folder",
        title: "研究",
        children: [
          {
            id: "folder-research-child",
            kind: "folder",
            title: "子目录",
            children: [
              {
                id: "tree-note-new",
                kind: "note",
                noteId: "note-new",
              },
            ],
          },
        ],
      },
    ]);
  });

  it("finds folders for note creation and note selection", () => {
    const workspace = createInitialWorkspaceData();
    const tree = appendNoteToWorkspaceTree(
      workspace.tree,
      "note-new",
      "folder-inbox",
    );

    expect(findFirstFolderId(tree)).toBe("folder-inbox");
    expect(findFolderIdContainingNote(tree, "note-new")).toBe("folder-inbox");
    expect(findFolderIdContainingNote(tree, "missing-note")).toBeNull();
  });

  it("removes notes from nested repository tree nodes", () => {
    const workspace = createInitialWorkspaceData();
    const tree = appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree(workspace.tree, "note-first", "folder-inbox"),
      "note-second",
      "folder-inbox",
    );

    expect(removeNoteFromWorkspaceTree(tree, "note-first")).toEqual([
      {
        id: "folder-inbox",
        kind: "folder",
        title: "仓库根目录",
        children: [
          {
            id: "tree-note-second",
            kind: "note",
            noteId: "note-second",
          },
        ],
      },
    ]);
  });

  it("adds and renames folders within the repository tree", () => {
    const workspace = createInitialWorkspaceData();
    const workspaceWithNote = {
      ...workspace,
      tree: appendNoteToWorkspaceTree(
        workspace.tree,
        "note-first",
        "folder-inbox",
      ),
    };
    const folder = createFolderTreeNode("folder-research", "研究");
    const tree = appendFolderToWorkspaceTree(
      workspaceWithNote.tree,
      folder,
      "folder-inbox",
    );

    expect(countFolders(tree)).toBe(2);
    expect(tree[0]).toMatchObject({
      id: "folder-inbox",
      kind: "folder",
      children: [
        {
          id: "folder-research",
          kind: "folder",
          title: "研究",
          children: [],
        },
        {
          id: "tree-note-first",
          kind: "note",
          noteId: "note-first",
        },
      ],
    });

    const renamedTree = renameFolderInWorkspaceTree(
      tree,
      "folder-research",
      "资料",
    );
    const renamedRoot = renamedTree[0];

    expect(renamedRoot.kind).toBe("folder");

    if (renamedRoot.kind !== "folder") {
      throw new Error("renamed root should be a folder");
    }

    expect(renamedRoot.children[0]).toMatchObject({
      id: "folder-research",
      title: "资料",
    });
  });

  it("removes folders and reports nested note ids", () => {
    const tree: NoteTreeNode[] = [
      {
        id: "folder-inbox",
        kind: "folder",
        title: "仓库根目录",
        children: [
          {
            id: "folder-research",
            kind: "folder",
            title: "研究",
            children: [
              {
                id: "tree-note-child",
                kind: "note",
                noteId: "note-child",
              },
            ],
          },
          {
            id: "tree-note-root",
            kind: "note",
            noteId: "note-root",
          },
        ],
      },
    ];

    expect(collectNoteIdsInFolder(tree, "folder-research")).toEqual([
      "note-child",
    ]);
    expect(removeFolderFromWorkspaceTree(tree, "folder-research")).toEqual([
      {
        id: "folder-inbox",
        kind: "folder",
        title: "仓库根目录",
        children: [
          {
            id: "tree-note-root",
            kind: "note",
            noteId: "note-root",
          },
        ],
      },
    ]);
  });

  it("moves notes between folders", () => {
    const workspace = createInitialWorkspaceData();
    const tree = appendFolderToWorkspaceTree(
      appendNoteToWorkspaceTree(workspace.tree, "note-first", "folder-inbox"),
      createFolderTreeNode("folder-target", "目标"),
      "folder-inbox",
    );
    const movedTree = moveNoteInWorkspaceTree(
      tree,
      "note-first",
      "folder-target",
    );

    expect(findFolderIdContainingNote(movedTree, "note-first")).toBe(
      "folder-target",
    );
    expect(moveNoteInWorkspaceTree(movedTree, "note-first", "missing")).toBe(
      movedTree,
    );
  });

  it("orders folders before notes while preserving local order", () => {
    const tree: NoteTreeNode[] = [
      {
        id: "tree-note-first",
        kind: "note",
        noteId: "note-first",
      },
      {
        id: "folder-a",
        kind: "folder",
        title: "A",
        children: [
          {
            id: "tree-note-child",
            kind: "note",
            noteId: "note-child",
          },
          {
            id: "folder-child",
            kind: "folder",
            title: "Child",
            children: [],
          },
        ],
      },
      {
        id: "tree-note-second",
        kind: "note",
        noteId: "note-second",
      },
      {
        id: "folder-b",
        kind: "folder",
        title: "B",
        children: [],
      },
    ];

    expect(orderNoteTreeNodesFoldersFirst(tree)).toEqual([
      {
        id: "folder-a",
        kind: "folder",
        title: "A",
        children: [
          {
            id: "folder-child",
            kind: "folder",
            title: "Child",
            children: [],
          },
          {
            id: "tree-note-child",
            kind: "note",
            noteId: "note-child",
          },
        ],
      },
      {
        id: "folder-b",
        kind: "folder",
        title: "B",
        children: [],
      },
      {
        id: "tree-note-first",
        kind: "note",
        noteId: "note-first",
      },
      {
        id: "tree-note-second",
        kind: "note",
        noteId: "note-second",
      },
    ]);
  });
});
