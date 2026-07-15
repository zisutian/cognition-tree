import {
  type FolderId,
  type NoteTreeNode,
} from "../workspaceData";
import type {
  NoteTreeFolderNode,
  NoteTreeMoveDestination,
  NoteTreeMoveRequest,
  NoteTreeNodeReference,
} from "./types";
import {
  findNoteTreeNodeLocation,
  getNoteTreeNodeReferenceId,
  isMatchingNoteTreeNode,
} from "./query";

function isFolderNodeDescendantReference(
  node: NoteTreeFolderNode,
  reference: NoteTreeNodeReference,
): boolean {
  return node.children.some((child) => {
    if (isMatchingNoteTreeNode(child, reference)) {
      return true;
    }

    return child.kind === "folder"
      ? isFolderNodeDescendantReference(child, reference)
      : false;
  });
}

function removeNoteTreeNode(
  tree: NoteTreeNode[],
  reference: NoteTreeNodeReference,
): {
  removedNode: NoteTreeNode | null;
  tree: NoteTreeNode[];
} {
  let removedNode: NoteTreeNode | null = null;
  const nextTree = tree.flatMap((node): NoteTreeNode[] => {
    if (isMatchingNoteTreeNode(node, reference)) {
      removedNode = node;
      return [];
    }

    if (node.kind !== "folder") {
      return [node];
    }

    const result = removeNoteTreeNode(node.children, reference);

    if (result.removedNode) {
      removedNode = result.removedNode;
    }

    return [
      {
        ...node,
        children: result.tree,
      },
    ];
  });

  return {
    removedNode,
    tree: nextTree,
  };
}

function insertNoteTreeNodeAtSiblingTarget({
  placement,
  sourceNode,
  targetIndex,
  tree,
}: {
  placement: "after" | "before";
  sourceNode: NoteTreeNode;
  targetIndex: number;
  tree: NoteTreeNode[];
}) {
  const insertionIndex = placement === "before" ? targetIndex : targetIndex + 1;

  return [
    ...tree.slice(0, insertionIndex),
    sourceNode,
    ...tree.slice(insertionIndex),
  ];
}

function insertNoteTreeNodeInFolder({
  folderId,
  sourceNode,
  tree,
}: {
  folderId: FolderId;
  sourceNode: NoteTreeNode;
  tree: NoteTreeNode[];
}): NoteTreeNode[] {
  return tree.map((node) => {
    if (node.kind !== "folder") {
      return node;
    }

    if (node.id === folderId) {
      return {
        ...node,
        children: [...node.children, sourceNode],
      };
    }

    return {
      ...node,
      children: insertNoteTreeNodeInFolder({
        folderId,
        sourceNode,
        tree: node.children,
      }),
    };
  });
}

function insertNoteTreeNodeNearTarget({
  placement,
  sourceNode,
  target,
  targetIndex,
  tree,
}: {
  placement: "after" | "before";
  sourceNode: NoteTreeNode;
  target: NoteTreeNodeReference;
  targetIndex: number;
  tree: NoteTreeNode[];
}): NoteTreeNode[] {
  if (tree.some((node) => isMatchingNoteTreeNode(node, target))) {
    return insertNoteTreeNodeAtSiblingTarget({
      placement,
      sourceNode,
      targetIndex,
      tree,
    });
  }

  return tree.map((node) => {
    if (node.kind !== "folder") {
      return node;
    }

    return {
      ...node,
      children: insertNoteTreeNodeNearTarget({
        placement,
        sourceNode,
        target,
        targetIndex,
        tree: node.children,
      }),
    };
  });
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

export function moveNoteTreeNode(
  tree: NoteTreeNode[],
  request: NoteTreeMoveRequest,
): NoteTreeNode[] {
  const sourceLocation = findNoteTreeNodeLocation(tree, request.source);
  const destinationReference = getDestinationReference(request.destination);

  if (!sourceLocation) {
    throw new Error(
      `Workspace tree node does not exist: ${getNoteTreeNodeReferenceId(
        request.source,
      )}`,
    );
  }

  if (
    destinationReference &&
    isMatchingNoteTreeNode(sourceLocation.node, destinationReference)
  ) {
    throw new Error("Workspace tree node cannot be moved onto itself.");
  }

  if (
    destinationReference &&
    sourceLocation.node.kind === "folder" &&
    isFolderNodeDescendantReference(sourceLocation.node, destinationReference)
  ) {
    throw new Error("Workspace folder cannot be moved into itself.");
  }

  if (
    destinationReference &&
    !findNoteTreeNodeLocation(tree, destinationReference)
  ) {
    throw new Error(
      `Workspace tree node does not exist: ${getNoteTreeNodeReferenceId(
        destinationReference,
      )}`,
    );
  }

  const removed = removeNoteTreeNode(tree, request.source);

  if (!removed.removedNode) {
    throw new Error(
      `Workspace tree node does not exist: ${getNoteTreeNodeReferenceId(
        request.source,
      )}`,
    );
  }

  if (request.destination.kind === "root") {
    return [...removed.tree, removed.removedNode];
  }

  if (request.destination.kind === "inside") {
    return insertNoteTreeNodeInFolder({
      folderId: request.destination.folderId,
      sourceNode: removed.removedNode,
      tree: removed.tree,
    });
  }

  const nextTargetLocation = findNoteTreeNodeLocation(
    removed.tree,
    request.destination.target,
  );

  if (!nextTargetLocation) {
    throw new Error(
      `Workspace tree node does not exist: ${getNoteTreeNodeReferenceId(
        request.destination.target,
      )}`,
    );
  }

  return insertNoteTreeNodeNearTarget({
    placement: request.destination.kind,
    sourceNode: removed.removedNode,
    target: request.destination.target,
    targetIndex: nextTargetLocation.index,
    tree: removed.tree,
  });
}
