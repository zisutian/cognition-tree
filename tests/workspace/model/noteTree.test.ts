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
import { createNoteTreeFolderNode } from "../../../src/workspace/model/noteTree/create";
import { moveNoteTreeNode } from "../../../src/workspace/model/noteTree/move";

function nodeIdentity(node: NoteTreeNode) {
  return node.kind === "folder" ? node.folderId : node.noteId;
}

function createNestedTree(): NoteTreeNode[] {
  return [
    { kind: "note", noteId: "note-root" },
    {
      children: [{ kind: "note", noteId: "note-child" }],
      folderId: "folder-project",
      kind: "folder",
      title: "项目",
    },
  ];
}

describe("note tree operations", () => {
  it("adds source-only note references at the root or in a folder", () => {
    const workspace = createInitialWorkspaceData();
    const rootTree = appendNoteToWorkspaceTree(workspace.tree, "note-root", null);
    const nestedTree: NoteTreeNode[] = [
      {
        children: [
          {
            children: [],
            folderId: "folder-child",
            kind: "folder",
            title: "子目录",
          },
        ],
        folderId: "folder-research",
        kind: "folder",
        title: "研究",
      },
    ];

    expect(rootTree).toEqual([{ kind: "note", noteId: "note-root" }]);
    expect(
      appendNoteToWorkspaceTree(nestedTree, "note-new", "folder-child"),
    ).toEqual([
      expect.objectContaining({
        children: [
          expect.objectContaining({
            children: [{ kind: "note", noteId: "note-new" }],
            folderId: "folder-child",
          }),
        ],
        folderId: "folder-research",
      }),
    ]);
  });

  it("removes notes and folders with their nested nodes", () => {
    const tree = appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree([], "note-first", null),
      "note-second",
      null,
    );

    expect(removeNoteFromWorkspaceTree(tree, "note-first")).toEqual([
      { kind: "note", noteId: "note-second" },
    ]);
    expect(removeFolderFromWorkspaceTree(createNestedTree(), "folder-project"))
      .toEqual([{ kind: "note", noteId: "note-root" }]);
  });

  it("adds and renames folders without derived node identities", () => {
    const tree = appendFolderToWorkspaceTree(
      appendNoteToWorkspaceTree([], "note-first", null),
      createNoteTreeFolderNode("folder-research", "研究"),
      null,
    );

    expect(tree.map(nodeIdentity)).toEqual(["note-first", "folder-research"]);
    expect(
      renameFolderInWorkspaceTree(tree, "folder-research", "资料")[1],
    ).toMatchObject({ folderId: "folder-research", title: "资料" });
  });

  it("rejects missing target folders when appending tree nodes", () => {
    expect(() => appendNoteToWorkspaceTree([], "note-new", "missing"))
      .toThrow("Workspace folder does not exist");
    expect(() =>
      appendFolderToWorkspaceTree(
        [],
        createNoteTreeFolderNode("folder-target", "目标"),
        "missing",
      ),
    ).toThrow("Workspace folder does not exist");
  });

  it("preserves sibling order and moves mixed node kinds before or after", () => {
    const tree: NoteTreeNode[] = [
      { kind: "note", noteId: "note-first" },
      {
        children: [],
        folderId: "folder-a",
        kind: "folder",
        title: "A",
      },
      { kind: "note", noteId: "note-second" },
    ];
    const folderFirst = moveNoteTreeNode(tree, {
      destination: {
        kind: "before",
        target: { kind: "note", noteId: "note-first" },
      },
      source: { folderId: "folder-a", kind: "folder" },
    });
    const noteAfterFolder = moveNoteTreeNode(folderFirst, {
      destination: {
        kind: "after",
        target: { folderId: "folder-a", kind: "folder" },
      },
      source: { kind: "note", noteId: "note-second" },
    });

    expect(noteAfterFolder.map(nodeIdentity)).toEqual([
      "folder-a",
      "note-second",
      "note-first",
    ]);
  });

  it("moves notes and folders across folders", () => {
    const tree: NoteTreeNode[] = [
      { kind: "note", noteId: "note-root" },
      {
        children: [],
        folderId: "folder-target",
        kind: "folder",
        title: "Target",
      },
      {
        children: [],
        folderId: "folder-source",
        kind: "folder",
        title: "Source",
      },
    ];
    const noteInsideFolder = moveNoteTreeNode(tree, {
      destination: { folderId: "folder-target", kind: "inside" },
      source: { kind: "note", noteId: "note-root" },
    });
    const folderInsideFolder = moveNoteTreeNode(noteInsideFolder, {
      destination: { folderId: "folder-target", kind: "inside" },
      source: { folderId: "folder-source", kind: "folder" },
    });

    expect(folderInsideFolder).toEqual([
      {
        children: [
          { kind: "note", noteId: "note-root" },
          {
            children: [],
            folderId: "folder-source",
            kind: "folder",
            title: "Source",
          },
        ],
        folderId: "folder-target",
        kind: "folder",
        title: "Target",
      },
    ]);
  });

  it("rejects self-descendant and missing-node moves", () => {
    const tree: NoteTreeNode[] = [
      {
        children: [{ kind: "note", noteId: "note-child" }],
        folderId: "folder-child",
        kind: "folder",
        title: "Child",
      },
      { kind: "note", noteId: "note-root" },
    ];

    expect(() =>
      moveNoteTreeNode(tree, {
        destination: {
          kind: "before",
          target: { kind: "note", noteId: "note-child" },
        },
        source: { folderId: "folder-child", kind: "folder" },
      }),
    ).toThrow("Workspace folder cannot be moved into itself");
    expect(() =>
      moveNoteTreeNode(tree, {
        destination: { folderId: "missing-folder", kind: "inside" },
        source: { kind: "note", noteId: "note-root" },
      }),
    ).toThrow("Workspace tree node does not exist");
    expect(() =>
      moveNoteTreeNode(tree, {
        destination: {
          kind: "after",
          target: { kind: "note", noteId: "note-root" },
        },
        source: { kind: "note", noteId: "missing-note" },
      }),
    ).toThrow("Workspace tree node does not exist");
  });

  it("moves a nested node to the root destination", () => {
    const tree: NoteTreeNode[] = [
      {
        children: [{ kind: "note", noteId: "note-child" }],
        folderId: "folder-parent",
        kind: "folder",
        title: "Parent",
      },
    ];

    expect(
      moveNoteTreeNode(tree, {
        destination: { kind: "root" },
        source: { kind: "note", noteId: "note-child" },
      }),
    ).toEqual([
      expect.objectContaining({ children: [], folderId: "folder-parent" }),
      { kind: "note", noteId: "note-child" },
    ]);
  });
});
