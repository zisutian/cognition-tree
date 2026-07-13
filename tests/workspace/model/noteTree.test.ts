import { describe, expect, it } from "vitest";
import {
  createInitialWorkspaceData,
  type NoteTreeNode,
} from "../../../src/workspace/model/workspaceData";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
  removeFolderFromWorkspaceTree,
  removeNoteFromWorkspaceTree,
  renameFolderInWorkspaceTree,
} from "../../../src/workspace/model/noteTree/mutations";
import {
  createNoteTreeFolderNode,
} from "../../../src/workspace/model/noteTree/create";
import {
  moveNoteTreeNode,
} from "../../../src/workspace/model/noteTree/move";

function createNestedTree(): NoteTreeNode[] {
  return [
    {
      id: "tree-note-root",
      kind: "note",
      noteId: "note-root",
    },
    {
      children: [
        {
          id: "tree-note-child",
          kind: "note",
          noteId: "note-child",
        },
      ],
      id: "folder-project",
      kind: "folder",
      title: "项目",
    },
  ];
}

describe("note tree operations", () => {
  it("adds newly created notes to the top level", () => {
    const workspace = createInitialWorkspaceData();
    const tree = appendNoteToWorkspaceTree(workspace.tree, "note-new", null);

    expect(tree).toEqual([
      {
        id: "tree-note-new",
        kind: "note",
        noteId: "note-new",
      },
    ]);
  });

  it("adds newly created notes to a selected folder", () => {
    const tree: NoteTreeNode[] = [
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

  it("removes notes from repository tree nodes", () => {
    const tree = appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree([], "note-first", null),
      "note-second",
      null,
    );

    expect(removeNoteFromWorkspaceTree(tree, "note-first")).toEqual([
      {
        id: "tree-note-second",
        kind: "note",
        noteId: "note-second",
      },
    ]);
  });

  it("adds and renames folders within the repository tree", () => {
    const tree = appendFolderToWorkspaceTree(
      appendNoteToWorkspaceTree([], "note-first", null),
      createNoteTreeFolderNode("folder-research", "研究"),
      null,
    );

    expect(tree.map((node) => node.id)).toEqual([
      "tree-note-first",
      "folder-research",
    ]);

    const renamedTree = renameFolderInWorkspaceTree(
      tree,
      "folder-research",
      "资料",
    );

    expect(renamedTree[1]).toMatchObject({
      id: "folder-research",
      title: "资料",
    });
  });

  it("removes folders and their nested nodes", () => {
    const tree = createNestedTree();

    expect(removeFolderFromWorkspaceTree(tree, "folder-project")).toEqual([
      {
        id: "tree-note-root",
        kind: "note",
        noteId: "note-root",
      },
    ]);
  });

  it("rejects missing target folders when appending tree nodes", () => {
    expect(() =>
      appendNoteToWorkspaceTree([], "note-new", "missing"),
    ).toThrow("Workspace folder does not exist");
    expect(() =>
      appendFolderToWorkspaceTree(
        [],
        createNoteTreeFolderNode("folder-target", "目标"),
        "missing",
      ),
    ).toThrow("Workspace folder does not exist");
  });

  it("preserves persisted sibling order for mixed folders and notes", () => {
    const tree = appendFolderToWorkspaceTree(
      appendNoteToWorkspaceTree([], "note-first", null),
      createNoteTreeFolderNode("folder-a", "A"),
      null,
    );

    expect(tree.map((node) => node.id)).toEqual([
      "tree-note-first",
      "folder-a",
    ]);
  });

  it("moves mixed sibling folders and notes before or after targets", () => {
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
        children: [],
      },
      {
        id: "tree-note-second",
        kind: "note",
        noteId: "note-second",
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

    expect(noteAfterFolder.map((node) => node.id)).toEqual([
      "folder-a",
      "tree-note-second",
      "tree-note-first",
    ]);
  });

  it("moves notes and folders across folders", () => {
    const tree: NoteTreeNode[] = [
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

    expect(folderInsideFolder).toMatchObject([
      {
        children: [
          { id: "tree-note-root", kind: "note" },
          { id: "folder-source", kind: "folder" },
        ],
        id: "folder-target",
        kind: "folder",
      },
    ]);
  });

  it("rejects invalid tree move requests", () => {
    const tree: NoteTreeNode[] = [
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
    ];

    expect(() =>
      moveNoteTreeNode(tree, {
        placement: "inside",
        source: { folderId: "folder-child", kind: "folder" },
        target: { kind: "note", noteId: "note-child" },
      }),
    ).toThrow("Workspace folder cannot be moved into itself");
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
