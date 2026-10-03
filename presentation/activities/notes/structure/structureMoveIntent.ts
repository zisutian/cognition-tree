import type { TreeMoveRequest } from "compact-ui";
import type { UiBlockNode, WorkspaceBlockTarget } from "../../../../application/workspace/index.ts";
import { findBlockById } from "./structureOperationBlocks.ts";

export type StructureMoveContext = {
  canMutate: boolean;
  repositoryId: string;
  sourceNoteId: string | null;
  sourceRoots: readonly UiBlockNode[];
  sourceTreeId: string;
  targetNoteId: string | null;
  targetRoots: readonly UiBlockNode[];
  targetTreeId: string;
};
export type StructureMoveIdentity = Pick<StructureMoveContext, "repositoryId" | "sourceNoteId" | "targetNoteId">;
export function structureContentKey(repositoryId: string, noteId: string | null) {
  return JSON.stringify([repositoryId, noteId]);
}
const positionNames = { before: "above", inside: "inside", after: "below" } as const;

/** Consume the framework batch, then resolve stable IDs in the current projection. */
export function resolveStructureMoveIntent(request: TreeMoveRequest, current: StructureMoveContext, expected: StructureMoveIdentity): {
  sourceBlockIds: readonly string[]; target: WorkspaceBlockTarget;
} | null {
  if (!current.canMutate || current.repositoryId !== expected.repositoryId || !current.sourceNoteId || !current.targetNoteId ||
    current.sourceNoteId !== expected.sourceNoteId || current.targetNoteId !== expected.targetNoteId ||
    request.source.treeId !== current.sourceTreeId || request.target.treeId !== current.targetTreeId ||
    request.source.contentKey !== structureContentKey(current.repositoryId, current.sourceNoteId) ||
    request.target.contentKey !== structureContentKey(current.repositoryId, current.targetNoteId) || request.source.nodeIds.length === 0) return null;
  if (current.sourceTreeId !== current.targetTreeId && current.sourceNoteId === current.targetNoteId) return null;
  const sources = request.source.nodeIds.map((id) => findBlockById(current.sourceRoots, id));
  if (sources.some((source) => !source)) return null;
  if (request.target.position === "root-end") return { sourceBlockIds: request.source.nodeIds, target: { kind: "end" } };
  const target = findBlockById(current.targetRoots, request.target.nodeId);
  if (!target) return null;
  if (current.sourceNoteId === current.targetNoteId && sources.some((source) => containsBlock(source!, target.id))) return null;
  return { sourceBlockIds: request.source.nodeIds, target: { kind: positionNames[request.target.position], targetBlockId: target.id } };
}
function containsBlock(source: UiBlockNode, targetId: string) {
  const pending = [source];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.id === targetId) return true;
    for (const child of node.children) pending.push(child);
  }
  return false;
}
export function requireStructureMoveIntent(request: TreeMoveRequest, current: StructureMoveContext, expected: StructureMoveIdentity) {
  const resolved = resolveStructureMoveIntent(request, current, expected);
  if (!resolved) throw new Error("无法移动结构块：源或目标已失效，请重新选择。");
  return resolved;
}
