import type { FolderId, NoteTreeNode } from "../workspaceData.ts";
import type {
  NoteTreeFolderNode,
  NoteTreeNodeLocation,
  NoteTreeNodeReference,
} from "./types.ts";
import {
  findNoteTreeNodePath,
  readNoteTreeNodeAtPath,
} from "./pathEditor.ts";

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
    ? node.kind === "folder" && node.folderId === reference.folderId
    : node.kind === "note" && node.noteId === reference.noteId;
}

export function findNoteTreeNodeLocation(
  tree: NoteTreeNode[],
  reference: NoteTreeNodeReference,
): NoteTreeNodeLocation | null {
  const path = findNoteTreeNodePath(tree, (node) =>
    isMatchingNoteTreeNode(node, reference),
  );

  if (!path) {
    return null;
  }

  const parentPath = path.slice(0, -1);
  const parentNode =
    parentPath.length > 0
      ? readNoteTreeNodeAtPath(tree, parentPath)
      : null;

  return {
    index: path[path.length - 1],
    node: readNoteTreeNodeAtPath(tree, path),
    parentFolderId:
      parentNode?.kind === "folder" ? parentNode.folderId : null,
  };
}

export function findFolderNode(
  tree: NoteTreeNode[],
  folderId: FolderId,
): NoteTreeFolderNode | null {
  const path = findNoteTreeNodePath(
    tree,
    (node) => node.kind === "folder" && node.folderId === folderId,
  );
  const node = path ? readNoteTreeNodeAtPath(tree, path) : null;

  return node?.kind === "folder" ? node : null;
}
