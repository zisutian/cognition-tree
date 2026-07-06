import { describe, expect, it } from "vitest";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
  createNoteTreeFolderNode,
} from "../../../../src/workspace/model/noteTree";
import {
  createInitialWorkspaceData,
  createNoteRecord,
} from "../../../../src/workspace/model/workspaceData";
import { resolveFolderSelection } from "../../../../src/application/workspace/view-model/selection";

const timestamp = "2026-07-04T00:00:00.000Z";

function createWorkspace() {
  const sourceNote = createNoteRecord("note-source", "源笔记", timestamp);
  const workspace = createInitialWorkspaceData();
  const treeWithFolder = appendFolderToWorkspaceTree(
    workspace.tree,
    createNoteTreeFolderNode("folder-project", "项目"),
    "folder-inbox",
  );

  return {
    ...workspace,
    notes: [sourceNote],
    tree: appendNoteToWorkspaceTree(
      treeWithFolder,
      sourceNote.id,
      "folder-project",
    ),
  };
}

describe("workspace selection", () => {
  it("keeps an existing folder selection", () => {
    const workspace = createWorkspace();

    expect(
      resolveFolderSelection(workspace, "folder-project"),
    ).toBe("folder-project");
  });

  it("resolves missing folder selection to the first workspace folder", () => {
    const workspace = createWorkspace();

    expect(
      resolveFolderSelection(workspace, "missing-folder"),
    ).toBe("folder-inbox");
  });
});
