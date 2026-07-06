import {
  defaultFolderId,
  type FolderId,
  type NoteTreeNode,
} from "../workspaceData";
import type {
  NoteTreeFolderNode,
  NoteTreeMovePlacement,
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
  placement: Exclude<NoteTreeMovePlacement, "inside">;
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
  placement: Exclude<NoteTreeMovePlacement, "inside">;
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

export function moveNoteTreeNode(
  tree: NoteTreeNode[],
  request: NoteTreeMoveRequest,
): NoteTreeNode[] {
  if (
    request.source.kind === "folder" &&
    request.source.folderId === defaultFolderId
  ) {
    throw new Error("Default workspace folder cannot be moved.");
  }

  const sourceLocation = findNoteTreeNodeLocation(tree, request.source);
  const targetLocation = findNoteTreeNodeLocation(tree, request.target);

  if (!sourceLocation) {
    throw new Error(
      `Workspace tree node does not exist: ${getNoteTreeNodeReferenceId(
        request.source,
      )}`,
    );
  }

  if (isMatchingNoteTreeNode(sourceLocation.node, request.target)) {
    throw new Error("Workspace tree node cannot be moved onto itself.");
  }

  if (
    sourceLocation.node.kind === "folder" &&
    isFolderNodeDescendantReference(sourceLocation.node, request.target)
  ) {
    throw new Error("Workspace folder cannot be moved into itself.");
  }

  if (!targetLocation) {
    throw new Error(
      `Workspace tree node does not exist: ${getNoteTreeNodeReferenceId(
        request.target,
      )}`,
    );
  }

  if (
    request.placement !== "inside" &&
    targetLocation.parentFolderId === null
  ) {
    throw new Error("Workspace tree node cannot be moved outside a folder.");
  }

  const removed = removeNoteTreeNode(tree, request.source);

  if (!removed.removedNode) {
    throw new Error(
      `Workspace tree node does not exist: ${getNoteTreeNodeReferenceId(
        request.source,
      )}`,
    );
  }

  if (request.placement === "inside") {
    if (request.target.kind !== "folder") {
      throw new Error("Workspace tree node can only be moved inside a folder.");
    }

    return insertNoteTreeNodeInFolder({
      folderId: request.target.folderId,
      sourceNode: removed.removedNode,
      tree: removed.tree,
    });
  }

  const nextTargetLocation = findNoteTreeNodeLocation(
    removed.tree,
    request.target,
  );

  if (!nextTargetLocation) {
    throw new Error(
      `Workspace tree node does not exist: ${getNoteTreeNodeReferenceId(
        request.target,
      )}`,
    );
  }

  return insertNoteTreeNodeNearTarget({
    placement: request.placement,
    sourceNode: removed.removedNode,
    target: request.target,
    targetIndex: nextTargetLocation.index,
    tree: removed.tree,
  });
}
