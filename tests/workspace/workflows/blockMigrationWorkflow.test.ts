import { describe, expect, it } from "vitest";
import {
  appendNoteToWorkspaceTree,
  findFolderIdContainingNote,
} from "../../../src/workspace/model/noteTree";
import {
  createNoteRecord,
} from "../../../src/workspace/model/workspaceData";
import {
  moveWorkspaceBlock,
  previewWorkspaceBlockMigration,
} from "../../../src/workspace/workflows/blockMigrationWorkflow";
import { defaultCtnSyntaxProfile } from "../../../src/ctn-syntax/defaultSyntaxProfile";
import {
  createInitialWorkspaceRuntime,
  type WorkspaceRuntime,
} from "../../../src/workspace/runtime/workspaceRuntime";

const timestamp = "2026-06-08T00:00:00.000Z";

function createMigrationWorkspace(): WorkspaceRuntime {
  const sourceNote = createNoteRecord(
    "note-source",
    "Root\n\t: Definition\n\t\t- Component\nSibling",
    timestamp,
  );
  const targetNote = createNoteRecord(
    "note-target",
    "Target\n\t> Understanding",
    timestamp,
  );
  const workspace = createInitialWorkspaceRuntime(defaultCtnSyntaxProfile);

    return {
      ...workspace,
      activeNoteId: sourceNote.id,
      notes: [sourceNote, targetNote],
      tree: appendNoteToWorkspaceTree(
        appendNoteToWorkspaceTree(workspace.tree, sourceNote.id, "folder-inbox"),
        targetNote.id,
        "folder-inbox",
      ),
    };
}

describe("workspace block migration", () => {
  it("moves a block subtree and updates both note records", () => {
    const workspace = createMigrationWorkspace();
    const result = moveWorkspaceBlock(
      workspace,
      {
        sourceBlockLineNumber: 2,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "inside-block", lineNumber: 1 },
      },
      "2026-06-08T01:00:00.000Z",
    );

    expect(result.status).toBe("moved");

    if (result.status !== "moved") {
      throw new Error(result.message);
    }

    expect(result.workspace.activeNoteId).toBe("note-target");
    expect(result.workspace.notes.find((note) => note.id === "note-source"))
      .toMatchObject({
        source: "Root\nSibling",
        title: "Root",
        updatedAt: "2026-06-08T01:00:00.000Z",
      });
    expect(result.workspace.notes.find((note) => note.id === "note-target"))
      .toMatchObject({
        source:
          "Target\n\t> Understanding\n\t: Definition\n\t\t- Component",
        title: "Target",
        updatedAt: "2026-06-08T01:00:00.000Z",
      });
    expect(findFolderIdContainingNote(result.workspace.tree, "note-target")).toBe(
      "folder-inbox",
    );
  });

  it("moves a block subtree to sibling positions through workspace requests", () => {
    const aboveResult = moveWorkspaceBlock(
      createMigrationWorkspace(),
      {
        sourceBlockLineNumber: 2,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "sibling-above", lineNumber: 1 },
      },
      "2026-06-08T01:00:00.000Z",
    );
    const belowResult = moveWorkspaceBlock(
      createMigrationWorkspace(),
      {
        sourceBlockLineNumber: 2,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "sibling-below", lineNumber: 1 },
      },
      "2026-06-08T01:00:00.000Z",
    );

    expect(aboveResult.status).toBe("moved");
    expect(belowResult.status).toBe("moved");

    if (aboveResult.status !== "moved" || belowResult.status !== "moved") {
      throw new Error("Expected sibling migration requests to move blocks.");
    }

    expect(aboveResult.workspace.notes.find((note) => note.id === "note-target"))
      .toMatchObject({
        source:
          ": Definition\n\t- Component\nTarget\n\t> Understanding",
      });
    expect(belowResult.workspace.notes.find((note) => note.id === "note-target"))
      .toMatchObject({
        source:
          "Target\n\t> Understanding\n: Definition\n\t- Component",
      });
  });

  it("rejects invalid migration requests before editing the workspace", () => {
    const workspace = createMigrationWorkspace();

    expect(
      moveWorkspaceBlock(
        workspace,
        {
          sourceBlockLineNumber: 1,
          sourceNoteId: "note-source",
          targetNoteId: "note-source",
          targetPosition: { kind: "end" },
        },
        timestamp,
      ),
    ).toMatchObject({
      message: "第一版不支持同一笔记内移动块。",
      status: "failed",
    });
    expect(
      moveWorkspaceBlock(
        workspace,
        {
          sourceBlockLineNumber: 99,
          sourceNoteId: "note-source",
          targetNoteId: "note-target",
          targetPosition: { kind: "end" },
        },
        timestamp,
      ),
    ).toMatchObject({
      message: "源块不存在。",
      status: "failed",
    });
    expect(
      moveWorkspaceBlock(
        workspace,
        {
          sourceBlockLineNumber: 1,
          sourceNoteId: "note-source",
          targetNoteId: "note-target",
          targetPosition: { kind: "inside-block", lineNumber: 99 },
        },
        timestamp,
      ),
    ).toMatchObject({
      message: "目标插入位置不存在。",
      status: "failed",
    });
  });

  it("previews migration readiness and blocked states", () => {
    const workspace = createMigrationWorkspace();

    expect(
      previewWorkspaceBlockMigration(workspace, {
        sourceBlockLineNumber: 2,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "end" },
      }),
    ).toEqual({
      message: "当前选择可迁移。",
      status: "ready",
    });
    expect(
      previewWorkspaceBlockMigration(workspace, {
        sourceBlockLineNumber: null,
        sourceNoteId: null,
        targetNoteId: "note-target",
        targetPosition: { kind: "end" },
      }),
    ).toEqual({
      message: "源笔记或目标笔记未选定。",
      status: "idle",
    });
  });
});
