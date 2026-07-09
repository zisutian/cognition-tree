import type {
  TreeDragState,
  TreeMoveRequest,
  TreeNode,
  TreeNodeReference,
} from "./types";

export const treeNodeDragDataType = "application/x-cognition-tree-node";

export function getTreeNodeReference(node: TreeNode): TreeNodeReference {
  return node.kind === "folder"
    ? {
        folderId: node.folderId,
        kind: "folder",
        parentFolderId: node.parentFolderId,
      }
    : {
        kind: "note",
        noteId: node.noteId,
        parentFolderId: node.parentFolderId,
      };
}

export function createTreeNodeDragPayload(reference: TreeNodeReference) {
  return JSON.stringify(reference);
}

export function getTreeNodeReferenceKey(reference: TreeNodeReference) {
  return reference.kind === "folder"
    ? `folder:${reference.folderId}`
    : `note:${reference.noteId}`;
}

function isSameTreeNodeReference(
  first: TreeNodeReference,
  second: TreeNodeReference,
) {
  return getTreeNodeReferenceKey(first) === getTreeNodeReferenceKey(second);
}

export function readTreeNodeDragPayload(value: string): TreeNodeReference | null {
  try {
    const parsed = JSON.parse(value) as TreeNodeReference;

    return parsed.kind === "folder" || parsed.kind === "note" ? parsed : null;
  } catch {
    return null;
  }
}

export function canDropTreeNode({
  canDropNode,
  source,
  target,
}: {
  canDropNode?: (source: TreeNodeReference, target: TreeNodeReference) => boolean;
  source: TreeNodeReference;
  target: TreeNodeReference;
}) {
  if (isSameTreeNodeReference(source, target)) {
    return false;
  }

  return canDropNode?.(source, target) ?? true;
}

export function createTreeMoveRequest({
  source,
  target,
}: {
  source: TreeNodeReference;
  target: TreeNodeReference;
}): TreeMoveRequest {
  return {
    placement: target.kind === "folder" ? "inside" : "after",
    source,
    target,
  };
}

export function getTreeDragClassNames({
  dragState,
  nodeReference,
}: {
  dragState: TreeDragState | null;
  nodeReference: TreeNodeReference;
}) {
  if (!dragState) {
    return [];
  }

  const nodeKey = getTreeNodeReferenceKey(nodeReference);

  return [
    dragState.sourceKey === nodeKey && "is-dragging",
    dragState.activeTargetKey === nodeKey &&
      (dragState.activeTargetCanDrop ? "is-drop-target" : "is-drop-disabled"),
  ];
}
