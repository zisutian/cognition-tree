// SPDX-License-Identifier: GPL-3.0-or-later

import {
  moveCtnBlocksWithinText,
  moveCtnBlocksText,
  CtnBlockMoveValidationError,
  type CtnBlockTextTargetPosition,
  type CtnCanonicalSourceAnalysis,
  type CtnContentMoveTarget,
} from "../../ctn/index.ts";
import type { NoteId } from "../model/workspaceData.ts";
import { replaceWorkspaceNoteSources } from "../model/workspaceData.ts";
import type { WorkspaceStructureIndex } from "../indexes/workspaceStructureIndex.ts";

export type WorkspaceStructureBlockTarget = CtnContentMoveTarget;

export type WorkspaceStructureBlocksMoveRequest = {
  sourceBlockIds: readonly string[];
  sourceNoteId: NoteId;
  targetNoteId: NoteId;
  target: WorkspaceStructureBlockTarget;
};

export type WorkspaceStructureBlocksMoveFailureReason =
  | "missing-note"
  | "parsed-note-missing"
  | "source-block-missing"
  | "empty-source"
  | "target-inside-source"
  | "target-position-missing"
  | "invalid-block-range";

export type WorkspaceStructureBlocksMoveResult =
  | {
      analysisOverrides: ReadonlyMap<NoteId, CtnCanonicalSourceAnalysis>;
      status: "moved";
      targetNoteId: NoteId;
      workspaceData: WorkspaceStructureIndex["data"];
    }
  | { reason: WorkspaceStructureBlocksMoveFailureReason; resourceId?: string; status: "failed" };

type WorkspaceStructureBlockMoveIndex = {
  getParsedNote(noteId: NoteId): {
    analysis: CtnCanonicalSourceAnalysis;
    note: { id: NoteId; source: string };
  } | null;
};

/** Stable identities are resolved together against one current workspace/index. */
export function moveWorkspaceStructureBlocks(
  workspace: WorkspaceStructureIndex,
  index: WorkspaceStructureBlockMoveIndex,
  request: WorkspaceStructureBlocksMoveRequest,
  timestamp: string,
): WorkspaceStructureBlocksMoveResult {
  const failure = (reason: WorkspaceStructureBlocksMoveFailureReason, resourceId?: string) => ({
    reason,
    ...(resourceId === undefined ? {} : { resourceId }),
    status: "failed" as const,
  });
  const sourceNote = workspace.noteEntryById.get(request.sourceNoteId)?.note;
  const targetNote = workspace.noteEntryById.get(request.targetNoteId)?.note;
  if (!sourceNote || !targetNote) return failure("missing-note", !sourceNote ? request.sourceNoteId : request.targetNoteId);
  const source = index.getParsedNote(request.sourceNoteId);
  const target = request.sourceNoteId === request.targetNoteId ? source : index.getParsedNote(request.targetNoteId);
  if (!source || !target || source.note.source !== sourceNote.source || target.note.source !== targetNote.source) {
    return failure("parsed-note-missing", !source || source.note.source !== sourceNote.source ? request.sourceNoteId : request.targetNoteId);
  }
  if (request.sourceBlockIds.length === 0) return failure("empty-source");
  const movableBlocks = source.analysis.document.blocks.filter((block) => block.rule.semanticId !== source.analysis.syntax.title.semanticId);
  const blocksById = new Map(movableBlocks.map((block) => [block.id, block]));
  const sourceBlocks = [];
  for (const id of new Set(request.sourceBlockIds)) {
    const block = blocksById.get(id);
    if (!block) return failure("source-block-missing", id);
    sourceBlocks.push(block);
  }
  let targetPosition: CtnBlockTextTargetPosition = { kind: "end" };
  if (request.target.kind !== "end") {
    const targetId = request.target.targetBlockId;
    const block = target.analysis.document.blocks.find((candidate) => candidate.id === targetId &&
      candidate.rule.semanticId !== target.analysis.syntax.title.semanticId);
    if (!block) return failure("target-position-missing", targetId);
    if (request.sourceNoteId === request.targetNoteId && sourceBlocks.some((sourceBlock) =>
      block.metadataLineNumber >= sourceBlock.metadataLineNumber && block.lineNumber <= sourceBlock.subtreeEndLineNumber)) {
      return failure("target-inside-source");
    }
    targetPosition = {
      block,
      kind: request.target.kind === "inside" ? "inside-block" : request.target.kind === "above" ? "sibling-above" : "sibling-below",
    };
  }
  try {
    if (request.sourceNoteId === request.targetNoteId) {
      const moved = moveCtnBlocksWithinText({ analysis: source.analysis, sourceBlocks, targetPosition, updatedAt: timestamp });
      return {
        analysisOverrides: new Map([[request.sourceNoteId, moved.analysis]]),
        status: "moved",
        targetNoteId: request.targetNoteId,
        workspaceData: replaceWorkspaceNoteSources(workspace.data, [{ noteId: request.sourceNoteId, source: moved.nextText }]),
      };
    }
    const moved = moveCtnBlocksText({ sourceAnalysis: source.analysis, targetAnalysis: target.analysis, sourceBlocks, targetPosition, updatedAt: timestamp });
    return {
      analysisOverrides: new Map([[request.sourceNoteId, moved.nextSourceAnalysis], [request.targetNoteId, moved.nextTargetAnalysis]]),
      status: "moved",
      targetNoteId: request.targetNoteId,
      workspaceData: replaceWorkspaceNoteSources(workspace.data, [
        { noteId: request.sourceNoteId, source: moved.nextSourceText },
        { noteId: request.targetNoteId, source: moved.nextTargetText },
      ]),
    };
  } catch (error) {
    if (error instanceof CtnBlockMoveValidationError) return failure("invalid-block-range");
    throw error;
  }
}

// Existing line-based core callers adapt once; all mutations use the batch implementation.
export type WorkspaceStructureBlockTargetPositionRequest =
  | { kind: "end" }
  | { kind: "inside-block" | "sibling-above" | "sibling-below"; lineNumber: number };
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
export type MoveWorkspaceStructureBlockBetweenNotesFailureReason = WorkspaceStructureBlocksMoveFailureReason | "same-note-unsupported";
export type MoveWorkspaceStructureBlockWithinNoteFailureReason = WorkspaceStructureBlocksMoveFailureReason;
export type MoveWorkspaceStructureBlockBetweenNotesResult =
  | Extract<WorkspaceStructureBlocksMoveResult, { status: "moved" }>
  | { reason: MoveWorkspaceStructureBlockBetweenNotesFailureReason; status: "failed" };
export type MoveWorkspaceStructureBlockWithinNoteResult =
  | (Omit<Extract<WorkspaceStructureBlocksMoveResult, { status: "moved" }>, "targetNoteId"> & { noteId: NoteId })
  | { reason: MoveWorkspaceStructureBlockWithinNoteFailureReason; status: "failed" };

function fromLineRequest(
  index: WorkspaceStructureBlockMoveIndex,
  request: WorkspaceStructureBlockMoveBetweenNotesRequest,
): { request: WorkspaceStructureBlocksMoveRequest; index: WorkspaceStructureBlockMoveIndex } | Extract<WorkspaceStructureBlocksMoveResult, { status: "failed" }> {
  const source = index.getParsedNote(request.sourceNoteId);
  const target = request.targetNoteId === request.sourceNoteId ? source : index.getParsedNote(request.targetNoteId);
  if (!source || !target) return { reason: "parsed-note-missing", status: "failed" };
  const sourceBlock = source.analysis.document.blocks.find((block) => block.lineNumber === request.sourceBlockLineNumber);
  if (!sourceBlock) return { reason: "source-block-missing", status: "failed" };
  let position: WorkspaceStructureBlockTarget = { kind: "end" };
  if (request.targetPosition.kind !== "end") {
    const lineNumber = request.targetPosition.lineNumber;
    const targetBlock = target.analysis.document.blocks.find((block) => block.lineNumber === lineNumber);
    if (!targetBlock) return { reason: "target-position-missing", status: "failed" };
    position = {
      kind: request.targetPosition.kind === "inside-block" ? "inside" : request.targetPosition.kind === "sibling-above" ? "above" : "below",
      targetBlockId: targetBlock.id,
    };
  }
  return {
    request: { sourceBlockIds: [sourceBlock.id], sourceNoteId: request.sourceNoteId, targetNoteId: request.targetNoteId, target: position },
    index: { getParsedNote: (noteId) => noteId === request.sourceNoteId ? source : noteId === request.targetNoteId ? target : null },
  };
}

export function moveWorkspaceStructureBlockBetweenNotes(
  workspace: WorkspaceStructureIndex,
  index: WorkspaceStructureBlockMoveIndex,
  request: WorkspaceStructureBlockMoveBetweenNotesRequest,
  timestamp: string,
): MoveWorkspaceStructureBlockBetweenNotesResult {
  if (!workspace.noteEntryById.has(request.sourceNoteId) || !workspace.noteEntryById.has(request.targetNoteId)) return { reason: "missing-note", status: "failed" };
  if (request.sourceNoteId === request.targetNoteId) return { reason: "same-note-unsupported", status: "failed" };
  const resolved = fromLineRequest(index, request);
  if ("status" in resolved) return resolved;
  const result = moveWorkspaceStructureBlocks(workspace, resolved.index, resolved.request, timestamp);
  return result.status === "failed" ? { status: "failed", reason: result.reason } : result;
}

export function moveWorkspaceStructureBlockWithinNote(
  workspace: WorkspaceStructureIndex,
  index: WorkspaceStructureBlockMoveIndex,
  request: WorkspaceStructureBlockMoveWithinNoteRequest,
  timestamp: string,
): MoveWorkspaceStructureBlockWithinNoteResult {
  if (!workspace.noteEntryById.has(request.noteId)) return { reason: "missing-note", status: "failed" };
  const resolved = fromLineRequest(index, { ...request, sourceNoteId: request.noteId, targetNoteId: request.noteId });
  if ("status" in resolved) return resolved;
  const moved = moveWorkspaceStructureBlocks(workspace, resolved.index, resolved.request, timestamp);
  if (moved.status === "failed") return { status: "failed", reason: moved.reason };
  const { targetNoteId, ...result } = moved;
  return { ...result, noteId: targetNoteId };
}
