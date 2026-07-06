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
  createNoteTreeFolderNode,
  findFolderIdContainingNote,
  findFirstFolderId,
  moveNoteInWorkspaceTree,
  removeFolderFromWorkspaceTree,
  removeNoteFromWorkspaceTree,
  moveNoteTreeNode,
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
    const folder = createNoteTreeFolderNode("folder-research", "研究");
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
          id: "tree-note-first",
          kind: "note",
          noteId: "note-first",
        },
        {
          id: "folder-research",
          kind: "folder",
          title: "研究",
          children: [],
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

    expect(renamedRoot.children[1]).toMatchObject({
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
      createNoteTreeFolderNode("folder-target", "目标"),
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
    expect(() =>
      moveNoteInWorkspaceTree(movedTree, "note-first", "missing"),
    ).toThrow("Workspace folder does not exist");
    expect(() =>
      moveNoteInWorkspaceTree(movedTree, "missing-note", "folder-target"),
    ).toThrow("Workspace note tree node does not exist");
  });

  it("rejects missing target folders when appending tree nodes", () => {
    const workspace = createInitialWorkspaceData();

    expect(() =>
      appendNoteToWorkspaceTree(workspace.tree, "note-new", "missing"),
    ).toThrow("Workspace folder does not exist");
    expect(() =>
      appendFolderToWorkspaceTree(
        workspace.tree,
        createNoteTreeFolderNode("folder-target", "目标"),
        "missing",
      ),
    ).toThrow("Workspace folder does not exist");
  });

  it("preserves persisted sibling order for mixed folders and notes", () => {
    const workspace = createInitialWorkspaceData();
    const tree = appendFolderToWorkspaceTree(
      appendNoteToWorkspaceTree(workspace.tree, "note-first", "folder-inbox"),
      createNoteTreeFolderNode("folder-a", "A"),
      "folder-inbox",
    );
    const root = tree[0];

    expect(root.kind).toBe("folder");

    if (root.kind !== "folder") {
      throw new Error("workspace root should be a folder");
    }

    expect(root.children.map((node) => node.id)).toEqual([
      "tree-note-first",
      "folder-a",
    ]);
  });

  it("moves mixed sibling folders and notes before or after targets", () => {
    const tree: NoteTreeNode[] = [
      {
        id: "folder-inbox",
        kind: "folder",
        title: "仓库根目录",
        children: [
          {
            id: "tree-note-first",
            kind: "note",
            noteId: "note-first",
          },
          {
            id: "folder-a",
            kind: "folder",
            title: "A",
            children: [],
          },
          {
            id: "tree-note-second",
            kind: "note",
            noteId: "note-second",
          },
        ],
      },
    ];
    const folderFirst = moveNoteTreeNode(tree, {
      placement: "before",
      source: { folderId: "folder-a", kind: "folder" },
      target: { kind: "note", noteId: "note-first" },
    });
    const noteAfterFolder = moveNoteTreeNode(folderFirst, {
      placement: "after",
      source: { kind: "note", noteId: "note-second" },
      target: { folderId: "folder-a", kind: "folder" },
    });
    const root = noteAfterFolder[0];

    expect(root.kind).toBe("folder");

    if (root.kind !== "folder") {
      throw new Error("workspace root should be a folder");
    }

    expect(root.children.map((node) => node.id)).toEqual([
      "folder-a",
      "tree-note-second",
      "tree-note-first",
    ]);
  });

  it("moves notes and folders across folders", () => {
    const tree: NoteTreeNode[] = [
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
          {
            id: "folder-target",
            kind: "folder",
            title: "Target",
            children: [],
          },
          {
            id: "folder-source",
            kind: "folder",
            title: "Source",
            children: [],
          },
        ],
      },
    ];
    const noteInsideFolder = moveNoteTreeNode(tree, {
      placement: "inside",
      source: { kind: "note", noteId: "note-root" },
      target: { folderId: "folder-target", kind: "folder" },
    });
    const folderInsideFolder = moveNoteTreeNode(noteInsideFolder, {
      placement: "inside",
      source: { folderId: "folder-source", kind: "folder" },
      target: { folderId: "folder-target", kind: "folder" },
    });

    expect(collectNoteIdsInFolder(folderInsideFolder, "folder-target")).toEqual([
      "note-root",
    ]);

    const root = folderInsideFolder[0];

    expect(root.kind).toBe("folder");

    if (root.kind !== "folder") {
      throw new Error("workspace root should be a folder");
    }

    const targetFolder = root.children.find(
      (node) => node.kind === "folder" && node.id === "folder-target",
    );

    expect(targetFolder).toMatchObject({
      children: [
        { id: "tree-note-root", kind: "note" },
        { id: "folder-source", kind: "folder" },
      ],
    });
  });

  it("rejects invalid tree move requests", () => {
    const tree: NoteTreeNode[] = [
      {
        id: "folder-inbox",
        kind: "folder",
        title: "仓库根目录",
        children: [
          {
            id: "folder-child",
            kind: "folder",
            title: "Child",
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

    expect(() =>
      moveNoteTreeNode(tree, {
        placement: "after",
        source: { folderId: "folder-inbox", kind: "folder" },
        target: { kind: "note", noteId: "note-root" },
      }),
    ).toThrow("Default workspace folder cannot be moved");
    expect(() =>
      moveNoteTreeNode(tree, {
        placement: "inside",
        source: { folderId: "folder-child", kind: "folder" },
        target: { kind: "note", noteId: "note-child" },
      }),
    ).toThrow("Workspace folder cannot be moved into itself");
    expect(() =>
      moveNoteTreeNode(tree, {
        placement: "before",
        source: { kind: "note", noteId: "note-root" },
        target: { folderId: "folder-inbox", kind: "folder" },
      }),
    ).toThrow("Workspace tree node cannot be moved outside a folder");
    expect(() =>
      moveNoteTreeNode(tree, {
        placement: "inside",
        source: { kind: "note", noteId: "note-root" },
        target: { kind: "note", noteId: "note-child" },
      }),
    ).toThrow("Workspace tree node can only be moved inside a folder");
    expect(() =>
      moveNoteTreeNode(tree, {
        placement: "after",
        source: { kind: "note", noteId: "missing-note" },
        target: { kind: "note", noteId: "note-root" },
      }),
    ).toThrow("Workspace tree node does not exist");
  });
});
