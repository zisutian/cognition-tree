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
  readWorkspaceNoteHeader,
  type WorkspaceData,
} from "../../../src/workspace/model/workspaceData";
import {
  moveWorkspaceStructureBlockBetweenNotes,
  moveWorkspaceStructureBlockWithinNote,
} from "../../../src/workspace/commands/structureBlockCommands";
import { defaultCtnSyntaxProfile } from "../../../ctn/syntax/defaultSyntaxProfile";
import { createWorkspaceParseIndex } from "../../../src/workspace/indexes/workspaceParseIndex";
import { createWorkspaceStructureIndex } from "../../../src/workspace/indexes/workspaceStructureIndex";
import { parseCtnCanonicalDocument } from "../../../ctn/parser/parseCtnDocument";
import {
  createCanonicalTestNote,
  readEditableTestSource,
} from "../workspaceTestFixture";

const timestamp = "2026-06-08T00:00:00.000Z";

function createStructureOperationWorkspace(): WorkspaceData {
  const sourceNote = createCanonicalTestNote(
    "note-source",
    "Source Title\nRoot\n\t: Definition\n\t\t- Component\nSibling",
    { timestamp },
  );
  const targetNote = createCanonicalTestNote(
    "note-target",
    "Target Title\nTarget\n\t> Understanding",
    { idOffset: 100, timestamp },
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

function getNote(workspace: WorkspaceData, noteId: string) {
  const note = workspace.notes.find((candidate) => candidate.id === noteId);

  if (!note) {
    throw new Error(`Missing test note: ${noteId}`);
  }

  return note;
}

function getContentLineNumber(
  workspace: WorkspaceData,
  noteId: string,
  rawText: string,
) {
  const lineIndex = getNote(workspace, noteId).source
    .split("\n")
    .findIndex((line) => line === rawText);

  if (lineIndex < 0) {
    throw new Error(`Missing test source line: ${rawText}`);
  }

  return lineIndex + 1;
}

function expectNoteSource(
  workspace: WorkspaceData,
  noteId: string,
  source: string,
) {
  expect(readEditableTestSource(getNote(workspace, noteId).source)).toBe(
    source,
  );
}

function moveStructureBlockBetweenNotes(
  workspaceData: WorkspaceData,
  request: Parameters<typeof moveWorkspaceStructureBlockBetweenNotes>[2],
  nextTimestamp = "2026-06-08T01:00:00.000Z",
) {
  const workspace = createWorkspaceStructureIndex(workspaceData);

  return moveWorkspaceStructureBlockBetweenNotes(
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
  request: Parameters<typeof moveWorkspaceStructureBlockWithinNote>[2],
  nextTimestamp = "2026-06-08T01:00:00.000Z",
) {
  const workspace = createWorkspaceStructureIndex(workspaceData);

  return moveWorkspaceStructureBlockWithinNote(
    workspace,
    createWorkspaceParseIndex({
      syntaxProfile: defaultCtnSyntaxProfile,
      workspace,
    }),
    request,
    nextTimestamp,
  );
}

describe("workspace structure block moves", () => {
  it("moves a block subtree and updates both note records", () => {
    const workspace = createStructureOperationWorkspace();
    const sourceBlockLineNumber = getContentLineNumber(
      workspace,
      "note-source",
      "\t: Definition",
    );
    const targetLineNumber = getContentLineNumber(
      workspace,
      "note-target",
      "Target",
    );
    const sourceDocument = parseCtnCanonicalDocument(
      getNote(workspace, "note-source").source,
      defaultCtnSyntaxProfile,
    );
    const movedRoot = sourceDocument.blocks.find(
      (block) => block.lineNumber === sourceBlockLineNumber,
    );

    if (!movedRoot) {
      throw new Error("Missing source block in test fixture.");
    }

    const movedBlockIds = new Set([
      movedRoot.id,
      ...sourceDocument.blocks
        .filter(
          (block) =>
            block.metadataLineNumber > movedRoot.metadataLineNumber &&
            block.lineNumber <= movedRoot.subtreeEndLineNumber,
        )
        .map((block) => block.id),
    ]);
    const result = moveStructureBlockBetweenNotes(
      workspace,
      {
        sourceBlockLineNumber,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "inside-block", lineNumber: targetLineNumber },
      },
    );

    expect(result.status).toBe("moved");

    if (result.status !== "moved") {
      throw new Error(result.reason);
    }

    expectNoteSource(
      result.workspaceData,
      "note-source",
      "Source Title\nRoot\nSibling",
    );
    expectNoteSource(
      result.workspaceData,
      "note-target",
      "Target Title\nTarget\n\t> Understanding\n\t: Definition\n\t\t- Component",
    );
    expect(readWorkspaceNoteHeader(getNote(result.workspaceData, "note-source"))).toMatchObject({
      title: "Source Title",
      updatedAt: "2026-06-08T01:00:00.000Z",
    });
    expect(readWorkspaceNoteHeader(getNote(result.workspaceData, "note-target"))).toMatchObject({
      title: "Target Title",
      updatedAt: "2026-06-08T01:00:00.000Z",
    });
    const movedBlocks = parseCtnCanonicalDocument(
      getNote(result.workspaceData, "note-target").source,
      defaultCtnSyntaxProfile,
    ).blocks.filter((block) => movedBlockIds.has(block.id));

    expect(movedBlocks).toHaveLength(2);
    expect(
      movedBlocks.map((block) => block.metadata.updatedAt),
    ).toEqual([
      "2026-06-08T01:00:00.000Z",
      "2026-06-08T01:00:00.000Z",
    ]);
    expect(
      createWorkspaceStructureIndex(result.workspaceData).noteEntryById.get(
        "note-target",
      )?.parentFolderId,
    ).toBe("folder-target");
  });

  it("moves an entire top-level concept block with its nested children", () => {
    const workspace = createStructureOperationWorkspace();
    const result = moveStructureBlockBetweenNotes(
      workspace,
      {
        sourceBlockLineNumber: getContentLineNumber(
          workspace,
          "note-source",
          "Root",
        ),
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "end" },
      },
    );

    expect(result.status).toBe("moved");

    if (result.status !== "moved") {
      throw new Error(result.reason);
    }

    expectNoteSource(result.workspaceData, "note-source", "Source Title\nSibling");
    expectNoteSource(
      result.workspaceData,
      "note-target",
      "Target Title\nTarget\n\t> Understanding\nRoot\n\t: Definition\n\t\t- Component",
    );
  });

  it("reads only source and target parsed notes from the structure block move index", () => {
    const baseWorkspace = createStructureOperationWorkspace();
    const workspace = {
      ...baseWorkspace,
      notes: [
        ...baseWorkspace.notes,
        createCanonicalTestNote(
          "note-unrelated",
          "Unrelated",
          { idOffset: 200, timestamp },
        ),
      ],
      tree: appendNoteToWorkspaceTree(
        baseWorkspace.tree,
        "note-unrelated",
        null,
      ),
    };
    const workspaceIndex = createWorkspaceStructureIndex(workspace);
    const index = createWorkspaceParseIndex({
      syntaxProfile: defaultCtnSyntaxProfile,
      workspace: workspaceIndex,
    });
    const requestedNoteIds: string[] = [];
    const result = moveWorkspaceStructureBlockBetweenNotes(
      workspaceIndex,
      {
        getParsedNote(noteId) {
          requestedNoteIds.push(noteId);
          return index.getParsedNote(noteId);
        },
      },
      {
        sourceBlockLineNumber: getContentLineNumber(
          workspace,
          "note-source",
          "\t: Definition",
        ),
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
    const aboveWorkspace = createStructureOperationWorkspace();
    const belowWorkspace = createStructureOperationWorkspace();
    const aboveResult = moveStructureBlockBetweenNotes(
      aboveWorkspace,
      {
        sourceBlockLineNumber: getContentLineNumber(
          aboveWorkspace,
          "note-source",
          "\t: Definition",
        ),
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: {
          kind: "sibling-above",
          lineNumber: getContentLineNumber(
            aboveWorkspace,
            "note-target",
            "Target",
          ),
        },
      },
    );
    const belowResult = moveStructureBlockBetweenNotes(
      belowWorkspace,
      {
        sourceBlockLineNumber: getContentLineNumber(
          belowWorkspace,
          "note-source",
          "\t: Definition",
        ),
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: {
          kind: "sibling-below",
          lineNumber: getContentLineNumber(
            belowWorkspace,
            "note-target",
            "Target",
          ),
        },
      },
    );

    expect(aboveResult.status).toBe("moved");
    expect(belowResult.status).toBe("moved");

    if (aboveResult.status !== "moved" || belowResult.status !== "moved") {
      throw new Error("Expected sibling structure block move requests to move blocks.");
    }

    expectNoteSource(
      aboveResult.workspaceData,
      "note-target",
      "Target Title\n: Definition\n\t- Component\nTarget\n\t> Understanding",
    );
    expectNoteSource(
      belowResult.workspaceData,
      "note-target",
      "Target Title\nTarget\n\t> Understanding\n: Definition\n\t- Component",
    );
  });

  it("rejects invalid structure block move requests before editing the workspace", () => {
    const workspace = createStructureOperationWorkspace();
    const sourceDefinitionLine = getContentLineNumber(
      workspace,
      "note-source",
      "\t: Definition",
    );
    const targetTitleLine = getContentLineNumber(
      workspace,
      "note-target",
      "Target Title",
    );

    expect(
      moveStructureBlockBetweenNotes(
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
      moveStructureBlockBetweenNotes(
        workspace,
        {
          sourceBlockLineNumber: sourceDefinitionLine,
          sourceNoteId: "note-source",
          targetNoteId: "note-target",
          targetPosition: { kind: "inside-block", lineNumber: targetTitleLine },
        },
        timestamp,
      ),
    ).toMatchObject({
      reason: "target-position-missing",
      status: "failed",
    });
    expect(
      moveStructureBlockBetweenNotes(
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
      moveStructureBlockBetweenNotes(
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
      moveStructureBlockBetweenNotes(
        workspace,
        {
          sourceBlockLineNumber: sourceDefinitionLine,
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
    const workspace = createStructureOperationWorkspace();
    const result = moveStructureBlock(
      workspace,
      {
        noteId: "note-source",
        sourceBlockLineNumber: getContentLineNumber(
          workspace,
          "note-source",
          "Root",
        ),
        targetPosition: { kind: "end" },
      },
    );

    expect(result.status).toBe("moved");

    if (result.status !== "moved") {
      throw new Error(result.reason);
    }

    expectNoteSource(
      result.workspaceData,
      "note-source",
      "Source Title\nSibling\nRoot\n\t: Definition\n\t\t- Component",
    );
    expect(readWorkspaceNoteHeader(getNote(result.workspaceData, "note-source"))).toMatchObject({
      title: "Source Title",
      updatedAt: "2026-06-08T01:00:00.000Z",
    });
  });

  it("rewrites indentation when moving a note block inside another block", () => {
    const workspace = createStructureOperationWorkspace();
    const result = moveStructureBlock(
      workspace,
      {
        noteId: "note-source",
        sourceBlockLineNumber: getContentLineNumber(
          workspace,
          "note-source",
          "Sibling",
        ),
        targetPosition: {
          kind: "inside-block",
          lineNumber: getContentLineNumber(
            workspace,
            "note-source",
            "\t: Definition",
          ),
        },
      },
    );

    expect(result.status).toBe("moved");

    if (result.status !== "moved") {
      throw new Error(result.reason);
    }

    expectNoteSource(
      result.workspaceData,
      "note-source",
      "Source Title\nRoot\n\t: Definition\n\t\t- Component\n\t\tSibling",
    );
  });

  it("rejects invalid note block structure moves", () => {
    const workspace = createStructureOperationWorkspace();
    const rootLine = getContentLineNumber(workspace, "note-source", "Root");
    const definitionLine = getContentLineNumber(
      workspace,
      "note-source",
      "\t: Definition",
    );

    expect(
      moveStructureBlock(workspace, {
        noteId: "note-missing",
        sourceBlockLineNumber: rootLine,
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
        sourceBlockLineNumber: rootLine,
        targetPosition: { kind: "inside-block", lineNumber: definitionLine },
      }),
    ).toMatchObject({
      reason: "target-inside-source",
      status: "failed",
    });
    expect(
      moveStructureBlock(workspace, {
        noteId: "note-source",
        sourceBlockLineNumber: definitionLine,
        targetPosition: { kind: "inside-block", lineNumber: 99 },
      }),
    ).toMatchObject({
      reason: "target-position-missing",
      status: "failed",
    });
  });
});
