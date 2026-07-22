import { describe, expect, it } from "vitest";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
} from "../../../../core/workspace/model/noteTree/mutations";
import {
  createNoteTreeFolderNode,
} from "../../../../core/workspace/model/noteTree/create";
import {
  createCanonicalNoteSource,
  createInitialWorkspaceData,
  createNoteRecord,
} from "../../../../core/workspace/model/workspaceData";
import { createWorkspaceStructureIndex } from "../../../../core/workspace/indexes/workspaceStructureIndex";
import { resolveFolderSelection } from "../../../../application/workspace/selection/resolveFolderSelection";

const timestamp = "2026-07-04T00:00:00.000Z";

function createWorkspace() {
  const sourceNote = createNoteRecord(
    "note-source",
    createCanonicalNoteSource({
      blockId: "00000000-0000-4000-8000-000000000001",
      timestamp,
      title: "源笔记",
    }),
  );
  const workspace = createInitialWorkspaceData();
  const treeWithFolder = appendFolderToWorkspaceTree(
    workspace.tree,
    createNoteTreeFolderNode("folder-project", "项目"),
    null,
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

  it("resolves missing folder selection to the top level", () => {
    const workspace = indexWorkspace();

    expect(
      resolveFolderSelection(workspace, "missing-folder"),
    ).toBeNull();
  });
});
