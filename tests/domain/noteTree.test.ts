import { describe, expect, it } from "vitest";
import {
  createInitialWorkspace,
  createNoteRecord,
  type NoteTreeNode,
} from "../../src/domain/notes";
import {
  appendNoteToWorkspaceTree,
  findFolderIdContainingNote,
  findFirstFolderId,
  removeNoteFromWorkspaceTree,
} from "../../src/domain/noteTree";

describe("note tree operations", () => {
  it("adds newly created notes to the inbox folder", () => {
    const workspace = createInitialWorkspace();
    const note = createNoteRecord(
      "note-new",
      "新笔记\n    : 本地保存",
      "2026-05-25T00:00:00.000Z",
    );
    const tree = appendNoteToWorkspaceTree(workspace.tree, note.id);

    expect(tree[tree.length - 1]).toEqual({
      id: "folder-inbox",
      kind: "folder",
      title: "未整理",
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
        title: "未整理",
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
    const workspace = createInitialWorkspace();
    const tree = appendNoteToWorkspaceTree(workspace.tree, "note-new");

    expect(findFirstFolderId(tree)).toBe("folder-inbox");
    expect(findFolderIdContainingNote(tree, "note-new")).toBe("folder-inbox");
    expect(findFolderIdContainingNote(tree, "missing-note")).toBeNull();
  });

  it("removes notes from nested repository tree nodes", () => {
    const workspace = createInitialWorkspace();
    const tree = appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree(workspace.tree, "note-first"),
      "note-second",
    );

    expect(removeNoteFromWorkspaceTree(tree, "note-first")).toEqual([
      {
        id: "folder-inbox",
        kind: "folder",
        title: "未整理",
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
});
