import { describe, expect, it } from "vitest";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
  createFolderTreeNode,
} from "../../../src/workspace/model/noteTree";
import {
  createInitialWorkspaceData,
  createNoteRecord,
  type WorkspaceData,
} from "../../../src/workspace/model/workspaceData";
import { defaultCtnSyntaxProfile } from "../../../src/ctn-syntax/defaultSyntaxProfile";
import { createInitialWorkspaceRuntime } from "../../../src/workspace/runtime/workspaceRuntime";
import {
  collectWorkspaceNoteIdsInFolder,
  countWorkspaceFolders,
  createWorkspaceIndex,
  createWorkspaceNoteSelectionTree,
  findActiveWorkspaceNote,
  findWorkspaceFolder,
  findWorkspaceFolderIdContainingNote,
  findWorkspaceNote,
  getDefaultWorkspaceFolderId,
  getParsedWorkspaceNote,
  getWorkspaceFolderChildCount,
  getWorkspaceFolderDisplayTitle,
  getWorkspaceNoteReferenceGraph,
  getWorkspaceNoteLineCount,
  getWorkspaceNoteCount,
  getWorkspaceTree,
  hasWorkspaceFolderChildren,
  hasWorkspaceNote,
  listWorkspaceNoteSummaries,
  listWorkspaceNotes,
  orderWorkspaceTreeNodesFoldersFirst,
  resolveExistingWorkspaceFolderId,
} from "../../../src/workspace/queries/workspaceQueries";

const timestamp = "2026-07-04T00:00:00.000Z";

function createWorkspace(): WorkspaceData {
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
    activeNoteId: sourceNote.id,
    notes: [sourceNote, targetNote],
    tree: appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree(treeWithFolder, sourceNote.id, "folder-inbox"),
      targetNote.id,
      "folder-project",
    ),
  };
}

describe("workspace queries", () => {
  it("reads notes and folders through workspace-level query names", () => {
    const workspace = createWorkspace();

    expect(listWorkspaceNotes(workspace).map((note) => note.id)).toEqual([
      "note-source",
      "note-target",
    ]);
    expect(getDefaultWorkspaceFolderId()).toBe("folder-inbox");
    expect(getWorkspaceTree(workspace)).toBe(workspace.tree);
    expect(listWorkspaceNoteSummaries(workspace)).toEqual([
      { id: "note-source", title: "源笔记" },
      { id: "note-target", title: "目标笔记" },
    ]);
    expect(getWorkspaceNoteCount(workspace)).toBe(2);
    expect(getWorkspaceNoteLineCount(workspace, "note-source")).toBe(1);
    expect(findWorkspaceNote(workspace, "note-source")).toMatchObject({
      title: "源笔记",
    });
    expect(findActiveWorkspaceNote(workspace)).toMatchObject({
      id: "note-source",
    });
    expect(hasWorkspaceNote(workspace, "missing-note")).toBe(false);
    expect(findWorkspaceFolder(workspace, "folder-project")).toMatchObject({
      title: "项目",
    });
  });

  it("resolves note placement and folder fallbacks from the workspace tree", () => {
    const workspace = createWorkspace();

    expect(
      findWorkspaceFolderIdContainingNote(workspace, "note-target"),
    ).toBe("folder-project");
    expect(
      collectWorkspaceNoteIdsInFolder(workspace, "folder-project"),
    ).toEqual(["note-target"]);
    expect(countWorkspaceFolders(workspace)).toBe(2);
    expect(resolveExistingWorkspaceFolderId(workspace, "missing-folder")).toBe(
      "folder-inbox",
    );
  });

  it("prepares tree details for feature display without exposing note tree helpers", () => {
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

  it("reads parsed notes from the workspace index", () => {
    const note = createNoteRecord("note-first", "概念\n    : 定义", timestamp);
    const workspace = {
      ...createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
      notes: [note],
      activeNoteId: note.id,
    };
    const index = createWorkspaceIndex(workspace);
    const result = getParsedWorkspaceNote(index, note.id);

    expect(result.document.blocks.map((block) => block.label)).toEqual([
      "顶格概念",
      "定义",
    ]);
  });

  it("returns an empty parsed note for missing note ids", () => {
    const index = createWorkspaceIndex(
      createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
    );
    const result = getParsedWorkspaceNote(index, null);

    expect(result).toMatchObject({
      document: { blocks: [], diagnostics: [], roots: [] },
      source: "",
    });
  });

  it("reads note reference graph data from the workspace index", () => {
    const source = createNoteRecord(
      "note-source",
      "Source [[Target]]",
      timestamp,
    );
    const target = createNoteRecord("note-target", "Target", timestamp);
    const isolated = createNoteRecord("note-isolated", "Isolated", timestamp);
    const workspace = {
      ...createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
      notes: [source, target, isolated],
    };

    expect(
      getWorkspaceNoteReferenceGraph(createWorkspaceIndex(workspace)),
    ).toMatchObject({
      edges: [
        {
          count: 1,
          sourceNoteId: "note-source",
          targetNoteId: "note-target",
          targetTitle: "Target",
        },
      ],
      nodes: [
        {
          id: "note-source",
          isolated: false,
          referencesOut: 1,
        },
        {
          id: "note-target",
          isolated: false,
          referencesIn: 1,
        },
        {
          id: "note-isolated",
          isolated: true,
        },
      ],
      unresolvedReferences: [],
    });
  });

  it("keeps unresolved global references visible in the reference graph", () => {
    const source = createNoteRecord(
      "note-source",
      "Source [[Missing Note]] and [[Missing Note]]",
      timestamp,
    );
    const workspace = {
      ...createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
      notes: [source],
    };

    expect(
      getWorkspaceNoteReferenceGraph(createWorkspaceIndex(workspace)),
    ).toMatchObject({
      edges: [],
      nodes: [
        {
          id: "note-source",
          isolated: false,
          referencesOut: 2,
        },
      ],
      unresolvedReferences: [
        {
          count: 2,
          sourceNoteId: "note-source",
          targetText: "Missing Note",
        },
      ],
    });
  });

  it("ignores global-reference text inside multiline blocks", () => {
    const source = createNoteRecord(
      "note-source",
      "Source\n    ```txt\n    [[Target]]\n    ```",
      timestamp,
    );
    const target = createNoteRecord("note-target", "Target", timestamp);
    const workspace = {
      ...createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
      notes: [source, target],
    };

    expect(
      getWorkspaceNoteReferenceGraph(createWorkspaceIndex(workspace)),
    ).toMatchObject({
      edges: [],
      nodes: [
        {
          id: "note-source",
          isolated: true,
        },
        {
          id: "note-target",
          isolated: true,
        },
      ],
    });
  });
});
