import type { FolderId, NoteId, NoteTreeNode } from "../workspaceData";
import type { NoteTreeFolderNode } from "./types";
import { createNoteTreeNoteNode } from "./create";
import {
  findNoteTreeNodePath,
  insertNoteTreeNodeAtPath,
  removeNoteTreeNodeAtPath,
  readNoteTreeNodeAtPath,
  replaceNoteTreeNodeAtPath,
} from "./pathEditor";

function findFolderPath(tree: readonly NoteTreeNode[], folderId: FolderId) {
  return findNoteTreeNodePath(
    tree,
    (node) => node.kind === "folder" && node.folderId === folderId,
  );
}

export function appendNoteToWorkspaceTree(
  tree: NoteTreeNode[],
  noteId: NoteId,
  parentFolderId: FolderId | null,
): NoteTreeNode[] {
  if (parentFolderId === null) {
    return [...tree, createNoteTreeNoteNode(noteId)];
  }

  const parentPath = findFolderPath(tree, parentFolderId);

  if (!parentPath) {
    throw new Error(`Workspace folder does not exist: ${parentFolderId}`);
  }

  return insertNoteTreeNodeAtPath(
    tree,
    parentPath,
    createNoteTreeNoteNode(noteId),
  );
}

export function appendFolderToWorkspaceTree(
  tree: NoteTreeNode[],
  folder: NoteTreeFolderNode,
  parentFolderId: FolderId | null,
): NoteTreeNode[] {
  if (parentFolderId === null) {
    return [...tree, folder];
  }

  const parentPath = findFolderPath(tree, parentFolderId);

  if (!parentPath) {
    throw new Error(`Workspace folder does not exist: ${parentFolderId}`);
  }

  return insertNoteTreeNodeAtPath(tree, parentPath, folder);
}

export function renameFolderInWorkspaceTree(
  tree: NoteTreeNode[],
  folderId: FolderId,
  title: string,
): NoteTreeNode[] {
  const path = findFolderPath(tree, folderId);

  if (!path) {
    throw new Error(`Workspace folder does not exist: ${folderId}`);
  }

  const node = readNoteTreeNodeAtPath(tree, path);

  if (node.kind !== "folder") {
    throw new Error(`Workspace tree node is not a folder: ${folderId}`);
  }

  return replaceNoteTreeNodeAtPath(tree, path, { ...node, title });
}

export function removeNoteFromWorkspaceTree(
  tree: NoteTreeNode[],
  noteId: NoteId,
): NoteTreeNode[] {
  const path = findNoteTreeNodePath(
    tree,
    (node) => node.kind === "note" && node.noteId === noteId,
  );

  return path ? removeNoteTreeNodeAtPath(tree, path).tree : tree;
}

export function removeFolderFromWorkspaceTree(
  tree: NoteTreeNode[],
  folderId: FolderId,
): NoteTreeNode[] {
  const path = findFolderPath(tree, folderId);

  return path ? removeNoteTreeNodeAtPath(tree, path).tree : tree;
}
