import type { NoteTreeNode } from "../workspaceData.ts";
import type {
  NoteTreeMoveDestination,
  NoteTreeMoveRequest,
  NoteTreeNodeReference,
} from "./types.ts";
import {
  findNoteTreeNodePath,
  insertNoteTreeNodeAtPath,
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
  const sourcePath = requireReferencePath(tree, request.source);
  const sourceNode = readNoteTreeNodeAtPath(tree, sourcePath);
  const destinationReference = getDestinationReference(request.destination);
  const destinationPath = destinationReference
    ? requireReferencePath(tree, destinationReference)
    : null;

  if (
    destinationReference &&
    isMatchingNoteTreeNode(sourceNode, destinationReference)
  ) {
    throw new Error("Workspace tree node cannot be moved onto itself.");
  }

  if (
    sourceNode.kind === "folder" &&
    destinationPath &&
    isStrictDescendantPath(sourcePath, destinationPath)
  ) {
    throw new Error("Workspace folder cannot be moved into itself.");
  }

  const removed = removeNoteTreeNodeAtPath(tree, sourcePath);

  if (request.destination.kind === "root") {
    return insertNoteTreeNodeAtPath(removed.tree, [], removed.node);
  }

  if (request.destination.kind === "inside") {
    const folderReference = {
      folderId: request.destination.folderId,
      kind: "folder" as const,
    };
    const folderPath = requireReferencePath(removed.tree, folderReference);
    const folder = readNoteTreeNodeAtPath(removed.tree, folderPath);

    if (folder.kind !== "folder") {
      throw new Error(
        `Workspace tree node is not a folder: ${request.destination.folderId}`,
      );
    }

    return insertNoteTreeNodeAtPath(removed.tree, folderPath, removed.node);
  }

  const targetPath = requireReferencePath(
    removed.tree,
    request.destination.target,
  );
  const targetIndex = targetPath[targetPath.length - 1];
  const parentPath = targetPath.slice(0, -1);
  const insertionIndex =
    request.destination.kind === "before" ? targetIndex : targetIndex + 1;

  return insertNoteTreeNodeAtPath(
    removed.tree,
    parentPath,
    removed.node,
    insertionIndex,
  );
}
