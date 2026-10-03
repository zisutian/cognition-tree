// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  WorkspaceStructureBlocksMoveFailureReason,
  WorkspaceStructureBlocksMoveRequest,
  WorkspaceStructureBlockTarget,
  NoteId,
} from "../../../../core/workspace/index.ts";
import type { SessionCommands } from "../../session/sessionCommands.ts";

export type StructureMoveFailureReason = WorkspaceStructureBlocksMoveFailureReason | "same-note-unsupported";
const structureMoveFailureMessages: Record<StructureMoveFailureReason, string> = {
  "missing-note": "无法移动结构块：笔记已不存在。",
  "parsed-note-missing": "无法移动结构块：笔记尚未完成解析。",
  "same-note-unsupported": "无法在跨笔记操作中选择同一笔记。",
  "source-block-missing": "无法移动结构块：源结构块已不存在。",
  "empty-source": "无法移动结构块：请先选择源结构块。",
  "target-inside-source": "无法把结构块移动到自身子树中。",
  "target-position-missing": "无法移动结构块：目标位置已不存在。",
  "invalid-block-range": "无法移动结构块：源码范围或块身份无效，请先修复源和目标。",
};
export function getStructureMoveFailureMessage(reason: StructureMoveFailureReason) {
  return structureMoveFailureMessages[reason];
}
function throwStructureMoveFailure(reason: StructureMoveFailureReason): never {
  throw new Error(getStructureMoveFailureMessage(reason));
}

function executeMove(move: SessionCommands["moveStructureBlocks"], request: WorkspaceStructureBlocksMoveRequest): NoteId {
  if (request.sourceBlockIds.length === 0) throwStructureMoveFailure("empty-source");
  const result = move(request);
  if (result.status !== "moved") throwStructureMoveFailure(result.reason);
  return result.targetNoteId;
}

export function executeStructureBlockMoveBetweenNotes({
  move, sourceBlockIds, sourceNoteId, targetNoteId, target,
}: {
  move: SessionCommands["moveStructureBlocks"];
  sourceBlockIds: readonly string[];
  sourceNoteId: NoteId | null;
  targetNoteId: NoteId | null;
  target: WorkspaceStructureBlockTarget;
}): NoteId {
  if (!sourceNoteId || !targetNoteId) throwStructureMoveFailure("missing-note");
  if (sourceNoteId === targetNoteId) throwStructureMoveFailure("same-note-unsupported");
  return executeMove(move, { sourceBlockIds, sourceNoteId, targetNoteId, target });
}

export function executeStructureBlockMoveWithinNote({
  move, noteId, sourceBlockIds, target,
}: {
  move: SessionCommands["moveStructureBlocks"];
  noteId: NoteId | null;
  sourceBlockIds: readonly string[];
  target: WorkspaceStructureBlockTarget;
}): NoteId {
  if (!noteId) throwStructureMoveFailure("missing-note");
  return executeMove(move, { sourceBlockIds, sourceNoteId: noteId, targetNoteId: noteId, target });
}
