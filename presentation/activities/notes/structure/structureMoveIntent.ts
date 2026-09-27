import type { ContentTreeMoveRequest } from "compact-ui";
import type { UiBlockNode } from "../../../../application/workspace/index.ts";
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

export type StructureMoveIdentity = Pick<
  StructureMoveContext,
  "repositoryId" | "sourceNoteId" | "targetNoteId"
>;

const positionNames = {
  before: "sibling-above",
  inside: "inside",
  after: "sibling-below",
} as const;

/** Resolve IDs against the latest projection immediately before a domain move. */
export function resolveStructureMoveIntent(
  request: ContentTreeMoveRequest,
  current: StructureMoveContext,
  expected: StructureMoveIdentity,
): { sourceLine: string; targetPosition: string } | null {
  if (
    !current.canMutate ||
    current.repositoryId !== expected.repositoryId ||
    !current.sourceNoteId ||
    !current.targetNoteId ||
    current.sourceNoteId !== expected.sourceNoteId ||
    current.targetNoteId !== expected.targetNoteId ||
    request.source.treeId !== current.sourceTreeId ||
    request.target.treeId !== current.targetTreeId
  ) return null;
  if (
    current.sourceTreeId !== current.targetTreeId &&
    current.sourceNoteId === current.targetNoteId
  ) return null;
  const source = findBlockById(current.sourceRoots, request.source.nodeId);
  if (!source) return null;
  if (request.target.position === "root-end") {
    return { sourceLine: String(source.lineNumber), targetPosition: "end" };
  }
  const target = findBlockById(current.targetRoots, request.target.nodeId);
  if (!target) return null;
  if (
    current.sourceTreeId === current.targetTreeId &&
    (source.id === target.id || containsDescendant(source, target.id))
  ) return null;
  return {
    sourceLine: String(source.lineNumber),
    targetPosition: `${positionNames[request.target.position]}:${target.lineNumber}`,
  };
}

function containsDescendant(source: UiBlockNode, targetId: string) {
  const pending = [...source.children];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    if (node.id === targetId) return true;
    pending.push(...node.children);
  }
  return false;
}

export function requireStructureMoveIntent(
  request: ContentTreeMoveRequest,
  current: StructureMoveContext,
  expected: StructureMoveIdentity,
) {
  const resolved = resolveStructureMoveIntent(request, current, expected);
  if (!resolved) throw new Error("无法移动结构块：源或目标已失效，请重新选择。");
  return resolved;
}
