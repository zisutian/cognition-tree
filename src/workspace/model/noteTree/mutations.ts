import type { FolderId, NoteId, NoteTreeNode } from "../workspaceData";
import type { NoteTreeFolderNode } from "./types";
import { createNoteTreeNoteNode } from "./create";
import { findFolderNode, findNoteTreeNodeLocation } from "./query";

export function appendNoteToWorkspaceTree(
  tree: NoteTreeNode[],
  noteId: NoteId,
  parentFolderId: FolderId | null,
): NoteTreeNode[] {
  if (parentFolderId === null) {
    return [...tree, createNoteTreeNoteNode(noteId)];
  }

  if (!findFolderNode(tree, parentFolderId)) {
    throw new Error(`Workspace folder does not exist: ${parentFolderId}`);
  }

  return appendNoteToWorkspaceTreeUnchecked(tree, noteId, parentFolderId);
}

function appendNoteToWorkspaceTreeUnchecked(
  tree: NoteTreeNode[],
  noteId: NoteId,
  folderId: FolderId,
): NoteTreeNode[] {
  return tree.map((node) => {
    if (node.kind !== "folder") {
      return node;
    }

    if (node.id !== folderId) {
      return {
        ...node,
        children: appendNoteToWorkspaceTreeUnchecked(
          node.children,
          noteId,
          folderId,
        ),
      };
    }

    return {
      ...node,
      children: [...node.children, createNoteTreeNoteNode(noteId)],
    };
  });
}

export function appendFolderToWorkspaceTree(
  tree: NoteTreeNode[],
  folder: NoteTreeFolderNode,
  parentFolderId: FolderId | null,
): NoteTreeNode[] {
  if (parentFolderId === null) {
    return [...tree, folder];
  }

  if (!findFolderNode(tree, parentFolderId)) {
    throw new Error(`Workspace folder does not exist: ${parentFolderId}`);
  }

  return appendFolderToWorkspaceTreeUnchecked(tree, folder, parentFolderId);
}

function appendFolderToWorkspaceTreeUnchecked(
  tree: NoteTreeNode[],
  folder: NoteTreeFolderNode,
  parentFolderId: FolderId,
): NoteTreeNode[] {
  return tree.map((node) => {
    if (node.kind !== "folder") {
      return node;
    }

    if (node.id !== parentFolderId) {
      return {
        ...node,
        children: appendFolderToWorkspaceTreeUnchecked(
          node.children,
          folder,
          parentFolderId,
        ),
      };
    }

    return {
      ...node,
      children: [...node.children, folder],
    };
  });
}

export function renameFolderInWorkspaceTree(
  tree: NoteTreeNode[],
  folderId: FolderId,
  title: string,
): NoteTreeNode[] {
  return tree.map((node) => {
    if (node.kind !== "folder") {
      return node;
    }

    return {
      ...node,
      title: node.id === folderId ? title : node.title,
      children: renameFolderInWorkspaceTree(node.children, folderId, title),
    };
  });
}

export function removeNoteFromWorkspaceTree(
  tree: NoteTreeNode[],
  noteId: NoteId,
): NoteTreeNode[] {
  return tree.flatMap((node): NoteTreeNode[] => {
    if (node.kind === "note") {
      return node.noteId === noteId ? [] : [node];
    }

    return [
      {
        ...node,
        children: removeNoteFromWorkspaceTree(node.children, noteId),
      },
    ];
  });
}

export function removeFolderFromWorkspaceTree(
  tree: NoteTreeNode[],
  folderId: FolderId,
): NoteTreeNode[] {
  return tree.flatMap((node): NoteTreeNode[] => {
    if (node.kind !== "folder") {
      return [node];
    }

    if (node.id === folderId) {
      return [];
    }

    return [
      {
        ...node,
        children: removeFolderFromWorkspaceTree(node.children, folderId),
      },
    ];
  });
}

export function moveNoteInWorkspaceTree(
  tree: NoteTreeNode[],
  noteId: NoteId,
  targetFolderId: FolderId | null,
): NoteTreeNode[] {
  if (targetFolderId !== null && !findFolderNode(tree, targetFolderId)) {
    throw new Error(`Workspace folder does not exist: ${targetFolderId}`);
  }

  const sourceLocation = findNoteTreeNodeLocation(tree, {
    kind: "note",
    noteId,
  });

  if (!sourceLocation) {
    throw new Error(`Workspace note tree node does not exist: ${noteId}`);
  }

  if (sourceLocation.parentFolderId === targetFolderId) {
    return tree;
  }

  return appendNoteToWorkspaceTree(
    removeNoteFromWorkspaceTree(tree, noteId),
    noteId,
    targetFolderId,
  );
}
