import type {
  TreeDragState,
  TreeMoveDestination,
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

function getTreeMoveDestinationReference(
  destination: TreeMoveDestination,
): TreeNodeReference | null {
  if (destination.kind === "root") {
    return null;
  }

  return destination.kind === "inside"
    ? {
        folderId: destination.folderId,
        kind: "folder",
        parentFolderId: null,
      }
    : destination.target;
}

function folderContainsReference(
  node: Extract<TreeNode, { kind: "folder" }>,
  reference: TreeNodeReference,
): boolean {
  const pending = [...node.children];

  while (pending.length > 0) {
    const child = pending.pop();

    if (!child) {
      continue;
    }

    const childReference = getTreeNodeReference(child);

    if (isSameTreeNodeReference(childReference, reference)) {
      return true;
    }

    if (child.kind === "folder") {
      pending.push(...child.children);
    }
  }

  return false;
}

function findFolderNode(
  nodes: TreeNode[],
  folderId: string,
): Extract<TreeNode, { kind: "folder" }> | null {
  const pending = [...nodes];

  while (pending.length > 0) {
    const node = pending.pop();

    if (!node || node.kind !== "folder") {
      continue;
    }

    if (node.folderId === folderId) {
      return node;
    }

    pending.push(...node.children);
  }

  return null;
}

export function readTreeNodeDragPayload(value: string): TreeNodeReference | null {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const candidate = parsed as Record<string, unknown>;
    const fields = Object.keys(candidate).sort();
    const hasValidParent =
      candidate.parentFolderId === null ||
      (typeof candidate.parentFolderId === "string" &&
        candidate.parentFolderId.length > 0);

    if (!hasValidParent) {
      return null;
    }

    if (
      candidate.kind === "folder" &&
      fields.join(",") === "folderId,kind,parentFolderId" &&
      typeof candidate.folderId === "string" &&
      candidate.folderId.length > 0
    ) {
      return {
        folderId: candidate.folderId,
        kind: "folder",
        parentFolderId: candidate.parentFolderId as string | null,
      };
    }

    return candidate.kind === "note" &&
      fields.join(",") === "kind,noteId,parentFolderId" &&
      typeof candidate.noteId === "string" &&
      candidate.noteId.length > 0
      ? {
          kind: "note",
          noteId: candidate.noteId,
          parentFolderId: candidate.parentFolderId as string | null,
        }
      : null;
  } catch {
    return null;
  }
}

export function canDropTreeNode({
  canDropDestination,
  destination,
  nodes,
  source,
}: {
  canDropDestination?: (
    source: TreeNodeReference,
    destination: TreeMoveDestination,
  ) => boolean;
  destination: TreeMoveDestination;
  nodes: TreeNode[];
  source: TreeNodeReference;
}) {
  const destinationReference = getTreeMoveDestinationReference(destination);

  if (
    destinationReference &&
    isSameTreeNodeReference(source, destinationReference)
  ) {
    return false;
  }

  if (source.kind === "folder" && destinationReference) {
    const sourceFolder = findFolderNode(nodes, source.folderId);

    if (
      sourceFolder &&
      folderContainsReference(sourceFolder, destinationReference)
    ) {
      return false;
    }
  }

  return canDropDestination?.(source, destination) ?? true;
}

export function createTreeRowDropDestination({
  offsetY,
  rowHeight,
  target,
}: {
  offsetY: number;
  rowHeight: number;
  target: TreeNodeReference;
}): TreeMoveDestination {
  const ratio = rowHeight <= 0 ? 0.5 : offsetY / rowHeight;

  if (target.kind === "folder" && ratio >= 0.25 && ratio <= 0.75) {
    return {
      folderId: target.folderId,
      kind: "inside",
    };
  }

  return {
    kind: ratio < 0.5 ? "before" : "after",
    target,
  };
}

export function createTreeMoveRequest({
  destination,
  source,
}: TreeMoveRequest): TreeMoveRequest {
  return { destination, source };
}

export function getTreeMoveDestinationTargetKey(
  destination: TreeMoveDestination | null,
) {
  const reference = destination
    ? getTreeMoveDestinationReference(destination)
    : null;

  return reference ? getTreeNodeReferenceKey(reference) : null;
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
  const activeTargetKey = getTreeMoveDestinationTargetKey(
    dragState.activeDestination,
  );
  const placement = dragState.activeDestination?.kind;

  return [
    dragState.sourceKey === nodeKey && "is-dragging",
    activeTargetKey === nodeKey &&
      (dragState.activeTargetCanDrop ? "is-drop-target" : "is-drop-disabled"),
    activeTargetKey === nodeKey &&
      dragState.activeTargetCanDrop &&
      placement &&
      `is-drop-${placement}`,
  ];
}
