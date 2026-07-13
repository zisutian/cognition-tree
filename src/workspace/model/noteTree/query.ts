import type { FolderId, NoteTreeNode } from "../workspaceData";
import type {
  NoteTreeFolderNode,
  NoteTreeNodeLocation,
  NoteTreeNodeReference,
} from "./types";

export function getNoteTreeNodeReferenceId(
  reference: NoteTreeNodeReference,
) {
  return reference.kind === "folder" ? reference.folderId : reference.noteId;
}

export function isMatchingNoteTreeNode(
  node: NoteTreeNode,
  reference: NoteTreeNodeReference,
) {
  return reference.kind === "folder"
    ? node.kind === "folder" && node.id === reference.folderId
    : node.kind === "note" && node.noteId === reference.noteId;
}

export function findNoteTreeNodeLocation(
  tree: NoteTreeNode[],
  reference: NoteTreeNodeReference,
  parentFolderId: FolderId | null = null,
): NoteTreeNodeLocation | null {
  for (const [index, node] of tree.entries()) {
    if (isMatchingNoteTreeNode(node, reference)) {
      return {
        index,
        node,
        parentFolderId,
      };
    }

    if (node.kind === "folder") {
      const childLocation = findNoteTreeNodeLocation(
        node.children,
        reference,
        node.id,
      );

      if (childLocation) {
        return childLocation;
      }
    }
  }

  return null;
}

export function findFolderNode(
  tree: NoteTreeNode[],
  folderId: FolderId,
): NoteTreeFolderNode | null {
  for (const node of tree) {
    if (node.kind !== "folder") {
      continue;
    }

    if (node.id === folderId) {
      return node;
    }

    const childFolder = findFolderNode(node.children, folderId);

    if (childFolder) {
      return childFolder;
    }
  }

  return null;
}
