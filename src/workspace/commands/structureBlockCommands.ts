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

export type WorkspaceStructureBlockTargetPositionRequest =
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

export type WorkspaceStructureBlockMoveBetweenNotesRequest = {
  sourceBlockLineNumber: number;
  sourceNoteId: NoteId;
  targetNoteId: NoteId;
  targetPosition: WorkspaceStructureBlockTargetPositionRequest;
};

export type WorkspaceStructureBlockMoveWithinNoteRequest = {
  noteId: NoteId;
  sourceBlockLineNumber: number;
  targetPosition: WorkspaceStructureBlockTargetPositionRequest;
};

export type MoveWorkspaceStructureBlockBetweenNotesFailureReason =
  | "missing-note"
  | "parsed-note-missing"
  | "same-note-unsupported"
  | "source-block-missing"
  | "target-position-missing";

export type MoveWorkspaceStructureBlockBetweenNotesResult =
  | {
      status: "moved";
      targetNoteId: NoteId;
      workspaceData: WorkspaceStructureIndex["data"];
    }
  | {
      reason: MoveWorkspaceStructureBlockBetweenNotesFailureReason;
      status: "failed";
    };

type MoveWorkspaceStructureBlockBetweenNotesFailureResult = Extract<
  MoveWorkspaceStructureBlockBetweenNotesResult,
  { status: "failed" }
>;

export type MoveWorkspaceStructureBlockWithinNoteFailureReason =
  | "missing-note"
  | "parsed-note-missing"
  | "source-block-missing"
  | "target-inside-source"
  | "target-position-missing";

export type MoveWorkspaceStructureBlockWithinNoteResult =
  | {
      noteId: NoteId;
      status: "moved";
      workspaceData: WorkspaceStructureIndex["data"];
    }
  | {
      reason: MoveWorkspaceStructureBlockWithinNoteFailureReason;
      status: "failed";
    };

type ParsedStructureBlockNote = {
  blocks: CtnBlock[];
  note: NoteRecord;
};

type WorkspaceStructureBlockMoveIndex = {
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
  reason: MoveWorkspaceStructureBlockBetweenNotesFailureReason,
): MoveWorkspaceStructureBlockBetweenNotesFailureResult {
  return {
    reason,
    status: "failed",
  };
}

function createNoteBlockFailure(
  reason: MoveWorkspaceStructureBlockWithinNoteFailureReason,
): MoveWorkspaceStructureBlockWithinNoteResult {
  return {
    reason,
    status: "failed",
  };
}

function createNoteBlockFailureFromBlockFailure(
  reason: MoveWorkspaceStructureBlockBetweenNotesFailureReason,
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

function isMovableStructureBlock(block: CtnBlock) {
  return block.type !== "title";
}

function resolveStructureBlockNote(
  index: WorkspaceStructureBlockMoveIndex,
  note: NoteRecord,
): ParsedStructureBlockNote | MoveWorkspaceStructureBlockBetweenNotesFailureResult {
  const parsedNote = index.getParsedNote(note.id);

  if (!parsedNote || !parsedNote.note) {
    return createFailure("parsed-note-missing");
  }

  return {
    blocks: parsedNote.document.blocks.filter(isMovableStructureBlock),
    note: parsedNote.note,
  };
}

function resolveTargetPosition(
  targetBlocks: CtnBlock[],
  targetPositionRequest: WorkspaceStructureBlockTargetPositionRequest,
): CtnBlockTextTargetPosition | MoveWorkspaceStructureBlockBetweenNotesFailureResult {
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
  result:
    | CtnBlockTextTargetPosition
    | MoveWorkspaceStructureBlockBetweenNotesFailureResult,
): result is CtnBlockTextTargetPosition {
  return !("status" in result);
}

function isStructureBlockNote(
  result:
    | ParsedStructureBlockNote
    | MoveWorkspaceStructureBlockBetweenNotesFailureResult,
): result is ParsedStructureBlockNote {
  return !("status" in result);
}

function resolveBetweenNotesMoveInput(
  workspace: WorkspaceStructureIndex,
  index: WorkspaceStructureBlockMoveIndex,
  request: WorkspaceStructureBlockMoveBetweenNotesRequest,
) {
  const sourceNote = findWorkspaceNote(workspace, request.sourceNoteId);
  const targetNote = findWorkspaceNote(workspace, request.targetNoteId);

  if (!sourceNote || !targetNote) {
    return createFailure("missing-note");
  }

  if (sourceNote.id === targetNote.id) {
    return createFailure("same-note-unsupported");
  }

  const sourceParsed = resolveStructureBlockNote(index, sourceNote);
  const targetParsed = resolveStructureBlockNote(index, targetNote);

  if (!isStructureBlockNote(sourceParsed)) {
    return sourceParsed;
  }

  if (!isStructureBlockNote(targetParsed)) {
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

export function moveWorkspaceStructureBlockBetweenNotes(
  workspace: WorkspaceStructureIndex,
  index: WorkspaceStructureBlockMoveIndex,
  request: WorkspaceStructureBlockMoveBetweenNotesRequest,
  timestamp: string,
): MoveWorkspaceStructureBlockBetweenNotesResult {
  const moveInput = resolveBetweenNotesMoveInput(workspace, index, request);

  if ("status" in moveInput) {
    return moveInput;
  }

  const result = moveCtnBlockText({
    sourceBlock: moveInput.sourceBlock,
    sourceText: moveInput.sourceParsed.note.source,
    targetPosition: moveInput.targetPosition,
    targetText: moveInput.targetParsed.note.source,
  });

  const sourceNoteId = moveInput.sourceParsed.note.id;
  const targetNoteId = moveInput.targetParsed.note.id;
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

export function moveWorkspaceStructureBlockWithinNote(
  workspace: WorkspaceStructureIndex,
  index: WorkspaceStructureBlockMoveIndex,
  request: WorkspaceStructureBlockMoveWithinNoteRequest,
  timestamp: string,
): MoveWorkspaceStructureBlockWithinNoteResult {
  const note = findWorkspaceNote(workspace, request.noteId);

  if (!note) {
    return createNoteBlockFailure("missing-note");
  }

  const parsedNote = resolveStructureBlockNote(index, note);

  if (!isStructureBlockNote(parsedNote)) {
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
