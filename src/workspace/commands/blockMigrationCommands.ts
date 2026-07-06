import type { CtnBlock } from "../../ctn/parser/types";
import {
  moveCtnBlockWithinText,
  moveCtnBlockText,
  type CtnBlockTextTargetPosition,
} from "../../ctn/parser/blockTextEdit";
import {
  inferNoteTitle,
  type NoteId,
  type NoteRecord,
} from "../model/workspaceData";
import type { WorkspaceStructureIndex } from "../indexes/workspaceStructureIndex";

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

export type WorkspaceNoteBlockMoveRequest = {
  noteId: NoteId;
  sourceBlockLineNumber: number;
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
      workspaceData: WorkspaceStructureIndex["data"];
    }
  | {
      reason: MoveWorkspaceBlockFailureReason;
      status: "failed";
    };

type MoveWorkspaceBlockFailureResult = Extract<
  MoveWorkspaceBlockResult,
  { status: "failed" }
>;

export type MoveWorkspaceNoteBlockFailureReason =
  | "missing-note"
  | "parsed-note-missing"
  | "source-block-missing"
  | "target-inside-source"
  | "target-position-missing";

export type MoveWorkspaceNoteBlockResult =
  | {
      noteId: NoteId;
      status: "moved";
      workspaceData: WorkspaceStructureIndex["data"];
    }
  | {
      reason: MoveWorkspaceNoteBlockFailureReason;
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

function findWorkspaceNote(workspace: WorkspaceStructureIndex, noteId: NoteId) {
  return workspace.noteById.get(noteId) ?? null;
}

function createFailure(
  reason: MoveWorkspaceBlockFailureReason,
): MoveWorkspaceBlockFailureResult {
  return {
    reason,
    status: "failed",
  };
}

function createNoteBlockFailure(
  reason: MoveWorkspaceNoteBlockFailureReason,
): MoveWorkspaceNoteBlockResult {
  return {
    reason,
    status: "failed",
  };
}

function createNoteBlockFailureFromBlockFailure(
  reason: MoveWorkspaceBlockFailureReason,
) {
  switch (reason) {
    case "missing-note":
    case "parsed-note-missing":
    case "source-block-missing":
    case "target-position-missing":
      return createNoteBlockFailure(reason);
    case "same-note-unsupported":
      throw new Error("Unexpected same-note block move failure.");
  }
}

function isMigratableBlock(block: CtnBlock) {
  return block.type !== "title";
}

function resolveMigrationNote(
  index: WorkspaceBlockMigrationIndex,
  note: NoteRecord,
): ParsedMigrationNote | MoveWorkspaceBlockFailureResult {
  const parsedNote = index.getParsedNote(note.id);

  if (!parsedNote || !parsedNote.note) {
    return createFailure("parsed-note-missing");
  }

  return {
    blocks: parsedNote.document.blocks.filter(isMigratableBlock),
    note: parsedNote.note,
  };
}

function resolveTargetPosition(
  targetBlocks: CtnBlock[],
  targetPositionRequest: WorkspaceBlockMigrationTargetPositionRequest,
): CtnBlockTextTargetPosition | MoveWorkspaceBlockFailureResult {
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

function isTargetInsideSourceBlock(
  sourceBlock: CtnBlock,
  targetPosition: CtnBlockTextTargetPosition,
) {
  return (
    targetPosition.kind !== "end" &&
    targetPosition.block.lineNumber >= sourceBlock.lineNumber &&
    targetPosition.block.lineNumber <= sourceBlock.endLineNumber
  );
}

function isTargetPosition(
  result: CtnBlockTextTargetPosition | MoveWorkspaceBlockFailureResult,
): result is CtnBlockTextTargetPosition {
  return !("status" in result);
}

function isMigrationNote(
  result: ParsedMigrationNote | MoveWorkspaceBlockFailureResult,
): result is ParsedMigrationNote {
  return !("status" in result);
}

function resolveMigrationInput(
  workspace: WorkspaceStructureIndex,
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
  workspace: WorkspaceStructureIndex,
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
  const sourceNoteIndex = workspace.noteIndexById.get(sourceNoteId);
  const targetNoteIndex = workspace.noteIndexById.get(targetNoteId);

  if (sourceNoteIndex === undefined || targetNoteIndex === undefined) {
    return createFailure("missing-note");
  }

  const notes = [...workspace.data.notes];
  const sourceNote = notes[sourceNoteIndex];
  const targetNote = notes[targetNoteIndex];

  notes[sourceNoteIndex] = {
    ...sourceNote,
    source: result.nextSourceText,
    title: inferNoteTitle(result.nextSourceText),
    updatedAt: timestamp,
  };
  notes[targetNoteIndex] = {
    ...targetNote,
    source: result.nextTargetText,
    title: inferNoteTitle(result.nextTargetText),
    updatedAt: timestamp,
  };

  return {
    status: "moved",
    targetNoteId,
    workspaceData: {
      id: workspace.data.id,
      name: workspace.data.name,
      notes,
      tree: workspace.data.tree,
    },
  };
}

export function moveWorkspaceNoteBlock(
  workspace: WorkspaceStructureIndex,
  index: WorkspaceBlockMigrationIndex,
  request: WorkspaceNoteBlockMoveRequest,
  timestamp: string,
): MoveWorkspaceNoteBlockResult {
  const note = findWorkspaceNote(workspace, request.noteId);

  if (!note) {
    return createNoteBlockFailure("missing-note");
  }

  const parsedNote = resolveMigrationNote(index, note);

  if (!isMigrationNote(parsedNote)) {
    return createNoteBlockFailureFromBlockFailure(parsedNote.reason);
  }

  const sourceBlock = parsedNote.blocks.find(
    (block) => block.lineNumber === request.sourceBlockLineNumber,
  );

  if (!sourceBlock) {
    return createNoteBlockFailure("source-block-missing");
  }

  const targetPosition = resolveTargetPosition(
    parsedNote.blocks,
    request.targetPosition,
  );

  if (!isTargetPosition(targetPosition)) {
    return createNoteBlockFailureFromBlockFailure(targetPosition.reason);
  }

  if (isTargetInsideSourceBlock(sourceBlock, targetPosition)) {
    return createNoteBlockFailure("target-inside-source");
  }

  const noteIndex = workspace.noteIndexById.get(note.id);

  if (noteIndex === undefined) {
    return createNoteBlockFailure("missing-note");
  }

  const result = moveCtnBlockWithinText({
    sourceBlock,
    sourceText: note.source,
    targetPosition,
  });
  const notes = [...workspace.data.notes];

  notes[noteIndex] = {
    ...note,
    source: result.nextText,
    title: inferNoteTitle(result.nextText),
    updatedAt: timestamp,
  };

  return {
    noteId: note.id,
    status: "moved",
    workspaceData: {
      id: workspace.data.id,
      name: workspace.data.name,
      notes,
      tree: workspace.data.tree,
    },
  };
}
