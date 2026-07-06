import { describe, expect, it } from "vitest";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
} from "../../../src/workspace/model/noteTree/mutations";
import {
  createNoteTreeFolderNode,
} from "../../../src/workspace/model/noteTree/create";
import {
  findFolderIdContainingNote,
} from "../../../src/workspace/model/noteTree/query";
import {
  createInitialWorkspaceData,
  createNoteRecord,
  type WorkspaceData,
} from "../../../src/workspace/model/workspaceData";
import {
  moveWorkspaceBlock,
  moveWorkspaceNoteBlock,
} from "../../../src/workspace/commands/blockMigrationCommands";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
import { createWorkspaceParseIndex } from "../../../src/workspace/indexes/workspaceParseIndex";
import { createWorkspaceStructureIndex } from "../../../src/workspace/indexes/workspaceStructureIndex";

const timestamp = "2026-06-08T00:00:00.000Z";

function createMigrationWorkspace(): WorkspaceData {
  const sourceNote = createNoteRecord(
    "note-source",
    "Source Title\nRoot\n\t: Definition\n\t\t- Component\nSibling",
    timestamp,
  );
  const targetNote = createNoteRecord(
    "note-target",
    "Target Title\nTarget\n\t> Understanding",
    timestamp,
  );
  const workspace = createInitialWorkspaceData();
  const treeWithFolder = appendFolderToWorkspaceTree(
    workspace.tree,
    createNoteTreeFolderNode("folder-target", "目标"),
    null,
  );

  return {
    ...workspace,
    notes: [sourceNote, targetNote],
    tree: appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree(treeWithFolder, sourceNote.id, null),
      targetNote.id,
      "folder-target",
    ),
  };
}

function moveMigrationBlock(
  workspaceData: WorkspaceData,
  request: Parameters<typeof moveWorkspaceBlock>[2],
  nextTimestamp = "2026-06-08T01:00:00.000Z",
) {
  const workspace = createWorkspaceStructureIndex(workspaceData);

  return moveWorkspaceBlock(
    workspace,
    createWorkspaceParseIndex({
      syntaxProfile: defaultCtnSyntaxProfile,
      workspace,
    }),
    request,
    nextTimestamp,
  );
}

function moveStructureBlock(
  workspaceData: WorkspaceData,
  request: Parameters<typeof moveWorkspaceNoteBlock>[2],
  nextTimestamp = "2026-06-08T01:00:00.000Z",
) {
  const workspace = createWorkspaceStructureIndex(workspaceData);

  return moveWorkspaceNoteBlock(
    workspace,
    createWorkspaceParseIndex({
      syntaxProfile: defaultCtnSyntaxProfile,
      workspace,
    }),
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
        sourceBlockLineNumber: 3,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "inside-block", lineNumber: 2 },
      },
    );

    expect(result.status).toBe("moved");

    if (result.status !== "moved") {
      throw new Error(result.reason);
    }

    expect(result.workspaceData.notes.find((note) => note.id === "note-source"))
      .toMatchObject({
        source: "Source Title\nRoot\nSibling",
        title: "Source Title",
        updatedAt: "2026-06-08T01:00:00.000Z",
      });
    expect(result.workspaceData.notes.find((note) => note.id === "note-target"))
      .toMatchObject({
        source:
          "Target Title\nTarget\n\t> Understanding\n\t: Definition\n\t\t- Component",
        title: "Target Title",
        updatedAt: "2026-06-08T01:00:00.000Z",
      });
    expect(
      findFolderIdContainingNote(result.workspaceData.tree, "note-target"),
    ).toBe("folder-target");
  });

  it("moves an entire top-level concept block with its nested children", () => {
    const result = moveMigrationBlock(
      createMigrationWorkspace(),
      {
        sourceBlockLineNumber: 2,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "end" },
      },
    );

    expect(result.status).toBe("moved");

    if (result.status !== "moved") {
      throw new Error(result.reason);
    }

    expect(result.workspaceData.notes.find((note) => note.id === "note-source"))
      .toMatchObject({
        source: "Source Title\nSibling",
      });
    expect(result.workspaceData.notes.find((note) => note.id === "note-target"))
      .toMatchObject({
        source:
          "Target Title\nTarget\n\t> Understanding\nRoot\n\t: Definition\n\t\t- Component",
      });
  });

  it("reads only source and target parsed notes from the migration index", () => {
    const baseWorkspace = createMigrationWorkspace();
    const workspace = {
      ...baseWorkspace,
      notes: [
        ...baseWorkspace.notes,
        createNoteRecord("note-unrelated", "Unrelated", timestamp),
      ],
    };
    const workspaceIndex = createWorkspaceStructureIndex(workspace);
    const index = createWorkspaceParseIndex({
      syntaxProfile: defaultCtnSyntaxProfile,
      workspace: workspaceIndex,
    });
    const requestedNoteIds: string[] = [];
    const result = moveWorkspaceBlock(
      workspaceIndex,
      {
        getParsedNote(noteId) {
          requestedNoteIds.push(noteId);
          return index.getParsedNote(noteId);
        },
      },
      {
        sourceBlockLineNumber: 3,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "end" },
      },
      "2026-06-08T01:00:00.000Z",
    );

    expect(result.status).toBe("moved");
    expect(requestedNoteIds).toEqual(["note-source", "note-target"]);
    expect([...index.parseCache.entriesById.keys()]).toEqual([
      "note-source",
      "note-target",
    ]);
  });

  it("moves a block subtree to sibling positions through workspace requests", () => {
    const aboveResult = moveMigrationBlock(
      createMigrationWorkspace(),
      {
        sourceBlockLineNumber: 3,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "sibling-above", lineNumber: 2 },
      },
    );
    const belowResult = moveMigrationBlock(
      createMigrationWorkspace(),
      {
        sourceBlockLineNumber: 3,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "sibling-below", lineNumber: 2 },
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
          "Target Title\n: Definition\n\t- Component\nTarget\n\t> Understanding",
      });
    expect(
      belowResult.workspaceData.notes.find((note) => note.id === "note-target"),
    )
      .toMatchObject({
        source:
          "Target Title\nTarget\n\t> Understanding\n: Definition\n\t- Component",
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
          sourceBlockLineNumber: 3,
          sourceNoteId: "note-source",
          targetNoteId: "note-target",
          targetPosition: { kind: "inside-block", lineNumber: 1 },
        },
        timestamp,
      ),
    ).toMatchObject({
      reason: "target-position-missing",
      status: "failed",
    });
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
          sourceBlockLineNumber: 3,
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

describe("workspace note block structure move", () => {
  it("moves a note block subtree inside the same note and updates the note record", () => {
    const result = moveStructureBlock(
      createMigrationWorkspace(),
      {
        noteId: "note-source",
        sourceBlockLineNumber: 2,
        targetPosition: { kind: "end" },
      },
    );

    expect(result.status).toBe("moved");

    if (result.status !== "moved") {
      throw new Error(result.reason);
    }

    expect(result.workspaceData.notes.find((note) => note.id === "note-source"))
      .toMatchObject({
        source: "Source Title\nSibling\nRoot\n\t: Definition\n\t\t- Component",
        title: "Source Title",
        updatedAt: "2026-06-08T01:00:00.000Z",
      });
  });

  it("rewrites indentation when moving a note block inside another block", () => {
    const result = moveStructureBlock(
      createMigrationWorkspace(),
      {
        noteId: "note-source",
        sourceBlockLineNumber: 5,
        targetPosition: { kind: "inside-block", lineNumber: 3 },
      },
    );

    expect(result.status).toBe("moved");

    if (result.status !== "moved") {
      throw new Error(result.reason);
    }

    expect(result.workspaceData.notes.find((note) => note.id === "note-source"))
      .toMatchObject({
        source:
          "Source Title\nRoot\n\t: Definition\n\t\t- Component\n\t\tSibling",
      });
  });

  it("rejects invalid note block structure moves", () => {
    const workspace = createMigrationWorkspace();

    expect(
      moveStructureBlock(workspace, {
        noteId: "note-missing",
        sourceBlockLineNumber: 2,
        targetPosition: { kind: "end" },
      }),
    ).toMatchObject({
      reason: "missing-note",
      status: "failed",
    });
    expect(
      moveStructureBlock(workspace, {
        noteId: "note-source",
        sourceBlockLineNumber: 1,
        targetPosition: { kind: "end" },
      }),
    ).toMatchObject({
      reason: "source-block-missing",
      status: "failed",
    });
    expect(
      moveStructureBlock(workspace, {
        noteId: "note-source",
        sourceBlockLineNumber: 2,
        targetPosition: { kind: "inside-block", lineNumber: 3 },
      }),
    ).toMatchObject({
      reason: "target-inside-source",
      status: "failed",
    });
    expect(
      moveStructureBlock(workspace, {
        noteId: "note-source",
        sourceBlockLineNumber: 3,
        targetPosition: { kind: "inside-block", lineNumber: 99 },
      }),
    ).toMatchObject({
      reason: "target-position-missing",
      status: "failed",
    });
  });
});
