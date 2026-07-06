import type { CtnBlock } from "../../ctn/parser/types";
import {
  moveCtnBlockText,
  type CtnBlockTextTargetPosition,
} from "../../ctn/parser/blockTextEdit";
import {
  inferNoteTitle,
  type NoteId,
  type NoteRecord,
  type WorkspaceData,
} from "../model/workspaceData";

export type WorkspaceBlockMigrationTargetPositionRequest =
  | {
      kind: "end";
    }
  | {
      kind: "inside-block";
      lineNumber: number;
    }
  | {
      kind: "sibling-above";
      lineNumber: number;
    }
  | {
      kind: "sibling-below";
      lineNumber: number;
    };

export type WorkspaceBlockMigrationRequest = {
  sourceBlockLineNumber: number;
  sourceNoteId: NoteId;
  targetNoteId: NoteId;
  targetPosition: WorkspaceBlockMigrationTargetPositionRequest;
};

export type MoveWorkspaceBlockFailureReason =
  | "missing-note"
  | "parsed-note-missing"
  | "same-note-unsupported"
  | "source-block-missing"
  | "target-position-missing";

export type MoveWorkspaceBlockResult =
  | {
      status: "moved";
      targetNoteId: NoteId;
      workspaceData: WorkspaceData;
    }
  | {
      reason: MoveWorkspaceBlockFailureReason;
      status: "failed";
    };

type ParsedMigrationNote = {
  blocks: CtnBlock[];
  note: NoteRecord;
};

type WorkspaceBlockMigrationIndex = {
  getParsedNote(noteId: NoteId): {
    document: {
      blocks: CtnBlock[];
    };
    note: NoteRecord | null;
  } | null;
};

function findWorkspaceNote(workspace: WorkspaceData, noteId: NoteId) {
  return workspace.notes.find((note) => note.id === noteId) ?? null;
}

function createFailure(
  reason: MoveWorkspaceBlockFailureReason,
): MoveWorkspaceBlockResult {
  return {
    reason,
    status: "failed",
  };
}

function resolveMigrationNote(
  index: WorkspaceBlockMigrationIndex,
  note: NoteRecord,
): ParsedMigrationNote | MoveWorkspaceBlockResult {
  const parsedNote = index.getParsedNote(note.id);

  if (!parsedNote || !parsedNote.note) {
    return createFailure("parsed-note-missing");
  }

  return {
    blocks: parsedNote.document.blocks,
    note: parsedNote.note,
  };
}

function resolveTargetPosition(
  targetBlocks: CtnBlock[],
  targetPositionRequest: WorkspaceBlockMigrationTargetPositionRequest,
): CtnBlockTextTargetPosition | MoveWorkspaceBlockResult {
  if (targetPositionRequest.kind === "end") {
    return { kind: "end" };
  }

  const targetBlock = targetBlocks.find(
    (block) => block.lineNumber === targetPositionRequest.lineNumber,
  );

  if (!targetBlock) {
    return createFailure("target-position-missing");
  }

  return {
    block: targetBlock,
    kind: targetPositionRequest.kind,
  };
}

function isTargetPosition(
  result: CtnBlockTextTargetPosition | MoveWorkspaceBlockResult,
): result is CtnBlockTextTargetPosition {
  return !("status" in result);
}

function isMigrationNote(
  result: ParsedMigrationNote | MoveWorkspaceBlockResult,
): result is ParsedMigrationNote {
  return !("status" in result);
}

function resolveMigrationInput(
  workspace: WorkspaceData,
  index: WorkspaceBlockMigrationIndex,
  request: WorkspaceBlockMigrationRequest,
) {
  const sourceNote = findWorkspaceNote(workspace, request.sourceNoteId);
  const targetNote = findWorkspaceNote(workspace, request.targetNoteId);

  if (!sourceNote || !targetNote) {
    return createFailure("missing-note");
  }

  if (sourceNote.id === targetNote.id) {
    return createFailure("same-note-unsupported");
  }

  const sourceParsed = resolveMigrationNote(index, sourceNote);
  const targetParsed = resolveMigrationNote(index, targetNote);

  if (!isMigrationNote(sourceParsed)) {
    return sourceParsed;
  }

  if (!isMigrationNote(targetParsed)) {
    return targetParsed;
  }

  const sourceBlock = sourceParsed.blocks.find(
    (block) => block.lineNumber === request.sourceBlockLineNumber,
  );

  if (!sourceBlock) {
    return createFailure("source-block-missing");
  }

  const targetPosition = resolveTargetPosition(
    targetParsed.blocks,
    request.targetPosition,
  );

  if (!isTargetPosition(targetPosition)) {
    return targetPosition;
  }

  return {
    sourceBlock,
    sourceParsed,
    targetParsed,
    targetPosition,
  };
}

export function moveWorkspaceBlock(
  workspace: WorkspaceData,
  index: WorkspaceBlockMigrationIndex,
  request: WorkspaceBlockMigrationRequest,
  timestamp: string,
): MoveWorkspaceBlockResult {
  const migrationInput = resolveMigrationInput(workspace, index, request);

  if ("status" in migrationInput) {
    return migrationInput;
  }

  const result = moveCtnBlockText({
    sourceBlock: migrationInput.sourceBlock,
    sourceText: migrationInput.sourceParsed.note.source,
    targetPosition: migrationInput.targetPosition,
    targetText: migrationInput.targetParsed.note.source,
  });

  const sourceNoteId = migrationInput.sourceParsed.note.id;
  const targetNoteId = migrationInput.targetParsed.note.id;

  return {
    status: "moved",
    targetNoteId,
    workspaceData: {
      id: workspace.id,
      name: workspace.name,
      notes: workspace.notes.map((note): NoteRecord => {
        if (note.id === sourceNoteId) {
          return {
            ...note,
            source: result.nextSourceText,
            title: inferNoteTitle(result.nextSourceText),
            updatedAt: timestamp,
          };
        }

        if (note.id === targetNoteId) {
          return {
            ...note,
            source: result.nextTargetText,
            title: inferNoteTitle(result.nextTargetText),
            updatedAt: timestamp,
          };
        }

        return note;
      }),
      tree: workspace.tree,
    },
  };
}
