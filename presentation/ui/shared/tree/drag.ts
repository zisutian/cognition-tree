import type {
  TreeMoveDestination,
  TreeNode,
  TreeNodeReference,
} from "./types.ts";

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

function getTreeNodeReferenceKey(reference: TreeNodeReference) {
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
