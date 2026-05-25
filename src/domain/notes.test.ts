import { describe, expect, it } from "vitest";
import {
  appendNoteToWorkspaceTree,
  createInitialWorkspace,
  createNoteRecord,
} from "./notes";

describe("note workspace", () => {
  it("keeps note content separate from the repository tree", () => {
    const workspace = createInitialWorkspace("2026-05-25T00:00:00.000Z");

    expect(workspace.notes.map((note) => note.id)).toEqual([
      "note-cognition-tree",
      "note-syntax-lab",
    ]);
    expect(workspace.tree.map((node) => node.id)).toEqual([
      "folder-core",
      "folder-lab",
      "folder-inbox",
    ]);
  });

  it("adds newly created notes to the inbox folder", () => {
    const workspace = createInitialWorkspace("2026-05-25T00:00:00.000Z");
    const note = createNoteRecord(
      "note-new",
      "新笔记\n  : 本地保存",
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
});
