import { describe, expect, it } from "vitest";
import {
  appendNoteToWorkspaceTree,
  findFolderIdContainingNote,
} from "../../../src/workspace/model/noteTree";
import { createNoteRecord } from "../../../src/workspace/model/workspaceData";
import { moveWorkspaceBlock } from "../../../src/workspace/commands/blockMigrationCommands";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
import {
  createInitialWorkspaceContext,
  type WorkspaceContext,
} from "../../../src/workspace/context/workspaceContext";
import { createWorkspaceIndex } from "../../../src/workspace/indexes/workspaceIndex";

const timestamp = "2026-06-08T00:00:00.000Z";

function createMigrationWorkspace(): WorkspaceContext {
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
  const workspace = createInitialWorkspaceContext(defaultCtnSyntaxProfile);

  return {
    ...workspace,
    notes: [sourceNote, targetNote],
    tree: appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree(workspace.tree, sourceNote.id, "folder-inbox"),
      targetNote.id,
      "folder-inbox",
    ),
  };
}

function moveMigrationBlock(
  workspace: WorkspaceContext,
  request: Parameters<typeof moveWorkspaceBlock>[2],
  nextTimestamp = "2026-06-08T01:00:00.000Z",
) {
  return moveWorkspaceBlock(
    workspace,
    createWorkspaceIndex(workspace),
    request,
    nextTimestamp,
  );
}

describe("workspace block migration", () => {
  it("moves a block subtree and updates both note records", () => {
    const workspace = createMigrationWorkspace();
    const result = moveMigrationBlock(
      workspace,
      {
        sourceBlockLineNumber: 2,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "inside-block", lineNumber: 1 },
      },
    );

    expect(result.status).toBe("moved");

    if (result.status !== "moved") {
      throw new Error(result.reason);
    }

    expect(result.workspaceData.notes.find((note) => note.id === "note-source"))
      .toMatchObject({
        source: "Root\nSibling",
        title: "Root",
        updatedAt: "2026-06-08T01:00:00.000Z",
      });
    expect(result.workspaceData.notes.find((note) => note.id === "note-target"))
      .toMatchObject({
        source:
          "Target\n\t> Understanding\n\t: Definition\n\t\t- Component",
        title: "Target",
        updatedAt: "2026-06-08T01:00:00.000Z",
      });
    expect(
      findFolderIdContainingNote(result.workspaceData.tree, "note-target"),
    ).toBe("folder-inbox");
  });

  it("moves a block subtree to sibling positions through workspace requests", () => {
    const aboveResult = moveMigrationBlock(
      createMigrationWorkspace(),
      {
        sourceBlockLineNumber: 2,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "sibling-above", lineNumber: 1 },
      },
    );
    const belowResult = moveMigrationBlock(
      createMigrationWorkspace(),
      {
        sourceBlockLineNumber: 2,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "sibling-below", lineNumber: 1 },
      },
    );

    expect(aboveResult.status).toBe("moved");
    expect(belowResult.status).toBe("moved");

    if (aboveResult.status !== "moved" || belowResult.status !== "moved") {
      throw new Error("Expected sibling migration requests to move blocks.");
    }

    expect(
      aboveResult.workspaceData.notes.find((note) => note.id === "note-target"),
    )
      .toMatchObject({
        source:
          ": Definition\n\t- Component\nTarget\n\t> Understanding",
      });
    expect(
      belowResult.workspaceData.notes.find((note) => note.id === "note-target"),
    )
      .toMatchObject({
        source:
          "Target\n\t> Understanding\n: Definition\n\t- Component",
      });
  });

  it("rejects invalid migration requests before editing the workspace", () => {
    const workspace = createMigrationWorkspace();

    expect(
      moveMigrationBlock(
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
      reason: "same-note-unsupported",
      status: "failed",
    });
    expect(
      moveMigrationBlock(
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
      reason: "source-block-missing",
      status: "failed",
    });
    expect(
      moveMigrationBlock(
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
      reason: "target-position-missing",
      status: "failed",
    });
  });

});
