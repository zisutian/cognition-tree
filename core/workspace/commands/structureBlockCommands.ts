import type { CtnCanonicalBlock } from "../../ctn/parser/types.ts";
import {
  moveCtnBlockWithinText,
  moveCtnBlockText,
  type CtnBlockTextTargetPosition,
} from "../../ctn/parser/blockTextEdit.ts";
import type {
  NoteId,
  WorkspaceNote,
} from "../model/workspaceData.ts";
import { replaceWorkspaceNoteSources } from "../model/workspaceData.ts";
import type { WorkspaceStructureIndex } from "../indexes/workspaceStructureIndex.ts";
import type {
  CtnCanonicalSourceAnalysis,
} from "../../ctn/analysis/sourceAnalysis.ts";

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
      analysisOverrides: ReadonlyMap<NoteId, CtnCanonicalSourceAnalysis>;
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
      analysisOverrides: ReadonlyMap<NoteId, CtnCanonicalSourceAnalysis>;
      noteId: NoteId;
      status: "moved";
      workspaceData: WorkspaceStructureIndex["data"];
    }
  | {
      reason: MoveWorkspaceStructureBlockWithinNoteFailureReason;
      status: "failed";
    };

type ParsedStructureBlockNote = {
  analysis: CtnCanonicalSourceAnalysis;
  blocks: CtnCanonicalBlock[];
  note: WorkspaceNote;
};

type WorkspaceStructureBlockMoveIndex = {
  getParsedNote(noteId: NoteId): {
    analysis: CtnCanonicalSourceAnalysis;
    note: WorkspaceNote;
  } | null;
};

function findWorkspaceNote(workspace: WorkspaceStructureIndex, noteId: NoteId) {
  return workspace.noteEntryById.get(noteId)?.projectedNote ?? null;
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

function isMovableStructureBlock(block: CtnCanonicalBlock) {
  return block.rule.semanticId !== "title";
}

function resolveStructureBlockNote(
  index: WorkspaceStructureBlockMoveIndex,
  note: WorkspaceNote,
): ParsedStructureBlockNote | MoveWorkspaceStructureBlockBetweenNotesFailureResult {
  const parsedNote = index.getParsedNote(note.id);

  if (!parsedNote) {
    return createFailure("parsed-note-missing");
  }

  return {
    analysis: parsedNote.analysis,
    blocks: parsedNote.analysis.document.blocks.filter(isMovableStructureBlock),
    note: parsedNote.note,
  };
}

function resolveTargetPosition(
  targetBlocks: CtnCanonicalBlock[],
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
  sourceBlock: CtnCanonicalBlock,
  targetPosition: CtnBlockTextTargetPosition,
) {
  return (
    targetPosition.kind !== "end" &&
    targetPosition.block.lineNumber >= sourceBlock.lineNumber &&
    targetPosition.block.lineNumber <= sourceBlock.subtreeEndLineNumber
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
    sourceAnalysis: moveInput.sourceParsed.analysis,
    targetPosition: moveInput.targetPosition,
    targetAnalysis: moveInput.targetParsed.analysis,
    updatedAt: timestamp,
  });

  const sourceNoteId = moveInput.sourceParsed.note.id;
  const targetNoteId = moveInput.targetParsed.note.id;
  const sourceNoteIndex = workspace.noteEntryById.get(sourceNoteId)?.noteIndex;
  const targetNoteIndex = workspace.noteEntryById.get(targetNoteId)?.noteIndex;

  if (sourceNoteIndex === undefined || targetNoteIndex === undefined) {
    return createFailure("missing-note");
  }

  const nextWorkspace = replaceWorkspaceNoteSources(workspace.data, [
    { noteId: sourceNoteId, source: result.nextSourceText },
    { noteId: targetNoteId, source: result.nextTargetText },
  ]);

  return {
    analysisOverrides: new Map([
      [sourceNoteId, result.nextSourceAnalysis],
      [targetNoteId, result.nextTargetAnalysis],
    ]),
    status: "moved",
    targetNoteId,
    workspaceData: nextWorkspace,
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

  const noteIndex = workspace.noteEntryById.get(note.id)?.noteIndex;

  if (noteIndex === undefined) {
    return createNoteBlockFailure("missing-note");
  }

  const result = moveCtnBlockWithinText({
    analysis: parsedNote.analysis,
    sourceBlock,
    targetPosition,
    updatedAt: timestamp,
  });
  const nextWorkspace = replaceWorkspaceNoteSources(workspace.data, [
    { noteId: note.id, source: result.nextText },
  ]);

  return {
    analysisOverrides: new Map([[note.id, result.analysis]]),
    noteId: note.id,
    status: "moved",
    workspaceData: nextWorkspace,
  };
}
