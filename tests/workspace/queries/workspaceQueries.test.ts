import { describe, expect, it } from "vitest";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
} from "../../../src/workspace/model/noteTree/mutations";
import {
  createNoteTreeFolderNode,
} from "../../../src/workspace/model/noteTree/create";
import {
  createInitialWorkspaceData,
  createNoteRecord,
  type NoteRecord,
  type WorkspaceData,
} from "../../../src/workspace/model/workspaceData";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
import { createWorkspaceStructureIndex } from "../../../src/workspace/indexes/workspaceStructureIndex";
import {
  collectWorkspaceNoteIdsInFolder,
  countWorkspaceFolders,
  createWorkspaceParseIndex,
  findWorkspaceFolder,
  findWorkspaceFolderIdContainingNote,
  findWorkspaceNote,
  getParsedWorkspaceNote,
  getWorkspaceNoteReferenceGraph,
  getWorkspaceNoteLineCount,
  getWorkspaceNoteCount,
  getWorkspaceTree,
  hasWorkspaceNote,
  listWorkspaceNoteSummaries,
  listWorkspaceNotes,
} from "../../../src/workspace/queries/workspaceQueries";

const timestamp = "2026-07-04T00:00:00.000Z";

function createWorkspace(): WorkspaceData {
  const sourceNote = createNoteRecord("note-source", "源笔记", timestamp);
  const targetNote = createNoteRecord("note-target", "目标笔记", timestamp);
  const workspace = createInitialWorkspaceData();
  const treeWithFolder = appendFolderToWorkspaceTree(
    workspace.tree,
    createNoteTreeFolderNode("folder-project", "项目"),
    null,
  );

  return {
    ...workspace,
    notes: [sourceNote, targetNote],
    tree: appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree(treeWithFolder, sourceNote.id, null),
      targetNote.id,
      "folder-project",
    ),
  };
}

function indexWorkspace(workspace: WorkspaceData) {
  return createWorkspaceStructureIndex(workspace);
}

function createParseIndex(notes: NoteRecord[]) {
  const workspace = indexWorkspace({
    ...createInitialWorkspaceData(),
    notes,
  });

  return createWorkspaceParseIndex({
    syntaxProfile: defaultCtnSyntaxProfile,
    workspace,
  });
}

describe("workspace queries", () => {
  it("reads notes and folders through workspace-level query names", () => {
    const workspaceData = createWorkspace();
    const workspace = indexWorkspace(workspaceData);

    expect(listWorkspaceNotes(workspace).map((note) => note.id)).toEqual([
      "note-source",
      "note-target",
    ]);
    expect(getWorkspaceTree(workspace)).toBe(workspaceData.tree);
    expect(listWorkspaceNoteSummaries(workspace)).toEqual([
      { id: "note-source", title: "源笔记" },
      { id: "note-target", title: "目标笔记" },
    ]);
    expect(getWorkspaceNoteCount(workspace)).toBe(2);
    expect(getWorkspaceNoteLineCount(workspace, "note-source")).toBe(1);
    expect(findWorkspaceNote(workspace, "note-source")).toMatchObject({
      title: "源笔记",
    });
    expect(hasWorkspaceNote(workspace, "missing-note")).toBe(false);
    expect(findWorkspaceFolder(workspace, "folder-project")).toMatchObject({
      title: "项目",
    });
  });

  it("resolves note placement from the workspace tree", () => {
    const workspace = indexWorkspace(createWorkspace());

    expect(
      findWorkspaceFolderIdContainingNote(workspace, "note-target"),
    ).toBe("folder-project");
    expect(
      collectWorkspaceNoteIdsInFolder(workspace, "folder-project"),
    ).toEqual(["note-target"]);
    expect(countWorkspaceFolders(workspace)).toBe(1);
  });

  it("reads parsed notes from the workspace index", () => {
    const note = createNoteRecord(
      "note-first",
      "标题\n概念\n    : 定义",
      timestamp,
    );
    const index = createParseIndex([note]);
    const result = getParsedWorkspaceNote(index, note.id);

    expect(result.document.blocks.map((block) => block.label)).toEqual([
      "标题",
      "顶格概念",
      "定义",
    ]);
  });

  it("returns an empty parsed note for missing note ids", () => {
    const index = createParseIndex([]);
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
    expect(
      getWorkspaceNoteReferenceGraph(
        createParseIndex([source, target, isolated]),
      ),
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
    expect(
      getWorkspaceNoteReferenceGraph(createParseIndex([source])),
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
    expect(
      getWorkspaceNoteReferenceGraph(createParseIndex([source, target])),
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
