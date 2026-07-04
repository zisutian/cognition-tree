import { describe, expect, it } from "vitest";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
  createFolderTreeNode,
} from "../../../src/workspace/model/noteTree";
import {
  createInitialWorkspaceData,
  createNoteRecord,
} from "../../../src/workspace/model/workspaceData";
import {
  createWorkspaceNoteSelectionTree,
  getWorkspaceFolderChildCount,
  getWorkspaceFolderDisplayTitle,
  hasWorkspaceFolderChildren,
  orderWorkspaceTreeNodesFoldersFirst,
} from "../../../src/ui/shared/workspaceTreeView";
import { findWorkspaceFolder } from "../../../src/workspace/queries/workspaceQueries";

const timestamp = "2026-07-04T00:00:00.000Z";

function createWorkspace() {
  const sourceNote = createNoteRecord("note-source", "源笔记", timestamp);
  const targetNote = createNoteRecord("note-target", "目标笔记", timestamp);
  const workspace = createInitialWorkspaceData();
  const treeWithFolder = appendFolderToWorkspaceTree(
    workspace.tree,
    createFolderTreeNode("folder-project", "项目"),
    "folder-inbox",
  );

  return {
    ...workspace,
    notes: [sourceNote, targetNote],
    tree: appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree(treeWithFolder, sourceNote.id, "folder-inbox"),
      targetNote.id,
      "folder-project",
    ),
  };
}

describe("workspace tree view helpers", () => {
  it("prepares folder display details for UI trees", () => {
    const workspace = createWorkspace();
    const rootFolder = findWorkspaceFolder(workspace, "folder-inbox");

    if (!rootFolder) {
      throw new Error("Expected inbox folder to exist.");
    }

    expect(getWorkspaceFolderDisplayTitle(rootFolder.id, rootFolder.title)).toBe(
      "仓库根目录",
    );
    expect(getWorkspaceFolderChildCount(rootFolder)).toBe(2);
    expect(hasWorkspaceFolderChildren(rootFolder)).toBe(true);
    expect(
      orderWorkspaceTreeNodesFoldersFirst(rootFolder.children)[0],
    ).toMatchObject({
      id: "folder-project",
      kind: "folder",
    });
  });

  it("adds orphan notes to the note selection tree", () => {
    const workspace = createWorkspace();
    const selectionTree = createWorkspaceNoteSelectionTree(
      [
        { id: "note-source" },
        { id: "note-target" },
        { id: "note-orphan" },
      ],
      workspace.tree,
    );

    expect(selectionTree[selectionTree.length - 1]).toEqual({
      id: "workspace-orphan-note-orphan",
      kind: "note",
      noteId: "note-orphan",
    });
  });
});
