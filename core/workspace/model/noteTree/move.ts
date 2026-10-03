import type { NoteTreeNode } from "../workspaceData.ts";
import type {
  NoteTreeMoveDestination,
  NoteTreeMoveRequest,
  NoteTreeBatchMoveRequest,
  NoteTreeNodeReference,
} from "./types.ts";
import {
  findNoteTreeNodePath,
  updateNoteTreeChildrenAtPath,
  readNoteTreeNodeAtPath,
  removeNoteTreeNodeAtPath,
} from "./pathEditor.ts";
import {
  getNoteTreeNodeReferenceId,
  isMatchingNoteTreeNode,
} from "./query.ts";

function findReferencePath(
  tree: readonly NoteTreeNode[],
  reference: NoteTreeNodeReference,
) {
  return findNoteTreeNodePath(tree, (node) =>
    isMatchingNoteTreeNode(node, reference),
  );
}

function getDestinationReference(
  destination: NoteTreeMoveDestination,
): NoteTreeNodeReference | null {
  if (destination.kind === "root") {
    return null;
  }

  return destination.kind === "inside"
    ? { folderId: destination.folderId, kind: "folder" }
    : destination.target;
}

function isStrictDescendantPath(
  ancestor: readonly number[],
  candidate: readonly number[],
) {
  return (
    candidate.length > ancestor.length &&
    ancestor.every((segment, index) => candidate[index] === segment)
  );
}

function requireReferencePath(
  tree: readonly NoteTreeNode[],
  reference: NoteTreeNodeReference,
) {
  const path = findReferencePath(tree, reference);

  if (!path) {
    throw new Error(
      `Workspace tree node does not exist: ${getNoteTreeNodeReferenceId(
        reference,
      )}`,
    );
  }

  return path;
}

export function moveNoteTreeNode(
  tree: NoteTreeNode[],
  request: NoteTreeMoveRequest,
): NoteTreeNode[] {
  return moveNoteTreeNodes(tree, {
    destination: request.destination,
    sources: [request.source],
  });
}

function comparePaths(left: readonly number[], right: readonly number[]) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

function equalTreePlacement(left: readonly NoteTreeNode[], right: readonly NoteTreeNode[]) {
  const pending = [{ left, right }];
  while (pending.length > 0) {
    const pair = pending.pop()!;
    if (pair.left.length !== pair.right.length) return false;
    for (let index = 0; index < pair.left.length; index += 1) {
      const before = pair.left[index];
      const after = pair.right[index];
      if (!isMatchingNoteTreeNode(before, after)) return false;
      if (before.kind === "folder" && after.kind === "folder") {
        pending.push({ left: before.children, right: after.children });
      }
    }
  }
  return true;
}

/** Resolve all identities before removing anything; overlapping children travel with their parent. */
export function moveNoteTreeNodes(
  tree: NoteTreeNode[],
  request: NoteTreeBatchMoveRequest,
): NoteTreeNode[] {
  if (request.sources.length === 0) {
    throw new Error("Workspace tree move requires at least one source.");
  }
  const paths = request.sources.map((source) => requireReferencePath(tree, source))
    .sort(comparePaths);
  const roots: number[][] = [];
  for (const path of paths) {
    const previous = roots.at(-1);
    if (previous && (comparePaths(previous, path) === 0 || isStrictDescendantPath(previous, path))) continue;
    roots.push(path);
  }
  const nodes = roots.map((path) => readNoteTreeNodeAtPath(tree, path));
  const destinationReference = getDestinationReference(request.destination);
  const destinationPath = destinationReference
    ? requireReferencePath(tree, destinationReference)
    : null;

  for (const sourcePath of roots) {
    if (destinationPath && comparePaths(sourcePath, destinationPath) === 0) {
      throw new Error("Workspace tree node cannot be moved onto itself.");
    }
    if (destinationPath && isStrictDescendantPath(sourcePath, destinationPath)) {
      throw new Error("Workspace folder cannot be moved into itself.");
    }
  }
  let remaining = tree;
  for (const path of roots.slice().reverse()) {
    remaining = removeNoteTreeNodeAtPath(remaining, path).tree;
  }
  let parentPath: number[] = [];
  let insertionIndex: number | undefined;
  if (request.destination.kind === "inside") {
    const folderReference = {
      folderId: request.destination.folderId,
      kind: "folder" as const,
    };
    parentPath = requireReferencePath(remaining, folderReference);
    const folder = readNoteTreeNodeAtPath(remaining, parentPath);

    if (folder.kind !== "folder") {
      throw new Error(
        `Workspace tree node is not a folder: ${request.destination.folderId}`,
      );
    }

  } else if (request.destination.kind !== "root") {
    const targetPath = requireReferencePath(remaining, request.destination.target);
    const targetIndex = targetPath[targetPath.length - 1];
    parentPath = targetPath.slice(0, -1);
    insertionIndex = request.destination.kind === "before" ? targetIndex : targetIndex + 1;
  }
  const next = updateNoteTreeChildrenAtPath(remaining, parentPath, (children) => {
    const index = insertionIndex ?? children.length;
    return [...children.slice(0, index), ...nodes, ...children.slice(index)];
  });
  return equalTreePlacement(tree, next) ? tree : next;
}
