import type { WorkspaceParseIndex } from "../../../../workspace/indexes/workspaceParseIndex";
import type {
  MoveWorkspaceStructureBlockBetweenNotesFailureReason,
  MoveWorkspaceStructureBlockWithinNoteFailureReason,
} from "../../../../workspace/commands/structureBlockCommands";
import type { NoteId } from "../../../../workspace/model/workspaceData";
import type { SessionCommands } from "../../session/sessionCommands";
import { parseUiStructureOperationTargetPosition } from "./targetPosition";

export type StructureMoveFailureReason =
  | MoveWorkspaceStructureBlockBetweenNotesFailureReason
  | MoveWorkspaceStructureBlockWithinNoteFailureReason;

const structureMoveFailureMessages: Record<
  StructureMoveFailureReason,
  string
> = {
  "missing-note": "无法移动结构块：笔记已不存在。",
  "parsed-note-missing": "无法移动结构块：笔记尚未完成解析。",
  "same-note-unsupported": "无法在跨笔记操作中选择同一笔记。",
  "source-block-missing": "无法移动结构块：源结构块已不存在。",
  "target-inside-source": "无法把结构块移动到自身子树中。",
  "target-position-missing": "无法移动结构块：目标位置已不存在。",
};

export function getStructureMoveFailureMessage(
  reason: StructureMoveFailureReason,
) {
  return structureMoveFailureMessages[reason];
}

function throwStructureMoveFailure(
  reason: StructureMoveFailureReason,
): never {
  throw new Error(getStructureMoveFailureMessage(reason));
}

export function executeStructureBlockMoveBetweenNotes({
  index,
  move,
  sourceBlockLineNumberValue,
  sourceNoteId,
  targetNoteId,
  targetPositionValue,
}: {
  index: WorkspaceParseIndex | null;
  move: SessionCommands["moveStructureBlockBetweenNotes"];
  sourceBlockLineNumberValue: string;
  sourceNoteId: NoteId | null;
  targetNoteId: NoteId | null;
  targetPositionValue: string;
}): NoteId {
  if (!sourceNoteId || !targetNoteId) {
    throwStructureMoveFailure("missing-note");
  }
  if (!index) {
    throwStructureMoveFailure("parsed-note-missing");
  }
  if (!sourceBlockLineNumberValue) {
    throwStructureMoveFailure("source-block-missing");
  }

  const result = move(index, {
    sourceBlockLineNumber: Number(sourceBlockLineNumberValue),
    sourceNoteId,
    targetNoteId,
    targetPosition: parseUiStructureOperationTargetPosition(
      targetPositionValue,
    ),
  });

  if (result.status !== "moved") {
    throwStructureMoveFailure(result.reason);
  }

  return result.targetNoteId;
}

export function executeStructureBlockMoveWithinNote({
  index,
  move,
  noteId,
  sourceBlockLineNumberValue,
  targetPositionValue,
}: {
  index: WorkspaceParseIndex | null;
  move: SessionCommands["moveStructureBlockWithinNote"];
  noteId: NoteId | null;
  sourceBlockLineNumberValue: string;
  targetPositionValue: string;
}): NoteId {
  if (!noteId) {
    throwStructureMoveFailure("missing-note");
  }
  if (!index) {
    throwStructureMoveFailure("parsed-note-missing");
  }
  if (!sourceBlockLineNumberValue) {
    throwStructureMoveFailure("source-block-missing");
  }

  const result = move(index, {
    noteId,
    sourceBlockLineNumber: Number(sourceBlockLineNumberValue),
    targetPosition: parseUiStructureOperationTargetPosition(
      targetPositionValue,
    ),
  });

  if (result.status !== "moved") {
    throwStructureMoveFailure(result.reason);
  }

  return result.noteId;
}
