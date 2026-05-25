import { describe, expect, it } from "vitest";
import {
  appendNoteToWorkspaceTree,
  createInitialWorkspace,
  createNoteRecord,
  resolveFolderSyntaxProfile,
  resolveNoteSyntaxProfile,
} from "./notes";

describe("note workspace", () => {
  it("keeps note content separate from the repository tree", () => {
    const workspace = createInitialWorkspace();

    expect(workspace.activeNoteId).toBeNull();
    expect(workspace.notes).toEqual([]);
    expect(workspace.tree.map((node) => node.id)).toEqual(["folder-inbox"]);
  });

  it("adds newly created notes to the inbox folder", () => {
    const workspace = createInitialWorkspace();
    const note = createNoteRecord(
      "note-new",
      "新笔记\n  : 本地保存",
      "2026-05-25T00:00:00.000Z",
    );
    const tree = appendNoteToWorkspaceTree(workspace.tree, note.id);

    expect(tree[tree.length - 1]).toEqual({
      defaultSyntaxProfileId: "ctn-default",
      defaultSyntaxVersion: 1,
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

  it("resolves note and folder syntax profiles from the workspace", () => {
    const workspace = createInitialWorkspace();
    const note = createNoteRecord(
      "note-new",
      "",
      "2026-05-25T00:00:00.000Z",
    );

    expect(resolveNoteSyntaxProfile(workspace, note).id).toBe("ctn-default");
    expect(resolveFolderSyntaxProfile(workspace, "folder-inbox").id).toBe(
      "ctn-default",
    );
  });
});
