import { describe, expect, it } from "vitest";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
} from "../../../../src/workspace/model/noteTree/mutations";
import {
  createNoteTreeFolderNode,
} from "../../../../src/workspace/model/noteTree/create";
import {
  createInitialWorkspaceData,
  createNoteRecord,
} from "../../../../src/workspace/model/workspaceData";
import { createWorkspaceStructureIndex } from "../../../../src/workspace/indexes/workspaceStructureIndex";
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

function indexWorkspace() {
  return createWorkspaceStructureIndex(createWorkspace());
}

describe("workspace selection", () => {
  it("keeps an existing folder selection", () => {
    const workspace = indexWorkspace();

    expect(
      resolveFolderSelection(workspace, "folder-project"),
    ).toBe("folder-project");
  });

  it("resolves missing folder selection to the first workspace folder", () => {
    const workspace = indexWorkspace();

    expect(
      resolveFolderSelection(workspace, "missing-folder"),
    ).toBe("folder-inbox");
  });
});
