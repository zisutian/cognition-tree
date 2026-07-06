import type { FolderId, NoteId, NoteTreeNode } from "../workspaceData";
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

export function findFolderIdContainingNote(
  tree: NoteTreeNode[],
  noteId: NoteId,
): FolderId | null {
  for (const node of tree) {
    if (node.kind !== "folder") {
      continue;
    }

    if (
      node.children.some(
        (child) => child.kind === "note" && child.noteId === noteId,
      )
    ) {
      return node.id;
    }

    const childFolderId = findFolderIdContainingNote(node.children, noteId);

    if (childFolderId) {
      return childFolderId;
    }
  }

  return null;
}

export function countFolders(tree: NoteTreeNode[]): number {
  return tree.reduce((count, node) => {
    if (node.kind !== "folder") {
      return count;
    }

    return count + 1 + countFolders(node.children);
  }, 0);
}

export function findFirstFolderId(tree: NoteTreeNode[]): FolderId | null {
  for (const node of tree) {
    if (node.kind !== "folder") {
      continue;
    }

    return node.id;
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

export function collectNoteIdsInFolder(
  tree: NoteTreeNode[],
  folderId: FolderId,
): NoteId[] {
  const folder = findFolderNode(tree, folderId);

  if (!folder) {
    return [];
  }

  return collectNoteIds(folder.children);
}

function collectNoteIds(tree: NoteTreeNode[]): NoteId[] {
  return tree.flatMap((node): NoteId[] => {
    if (node.kind === "note") {
      return [node.noteId];
    }

    return collectNoteIds(node.children);
  });
}
