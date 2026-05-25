import {
  defaultFolderId,
  type FolderId,
  type NoteId,
  type NoteTreeNode,
} from "./notes";

export type FolderTreeNode = Extract<NoteTreeNode, { kind: "folder" }>;
export type NoteTreeNoteNode = Extract<NoteTreeNode, { kind: "note" }>;

export function createNoteTreeNode(noteId: NoteId): NoteTreeNoteNode {
  return {
    id: `tree-${noteId}`,
    kind: "note",
    noteId,
  };
}

export function appendNoteToWorkspaceTree(
  tree: NoteTreeNode[],
  noteId: NoteId,
  folderId: FolderId = defaultFolderId,
): NoteTreeNode[] {
  return tree.map((node) => {
    if (node.kind !== "folder") {
      return node;
    }

    if (node.id !== folderId) {
      return {
        ...node,
        children: appendNoteToWorkspaceTree(node.children, noteId, folderId),
      };
    }

    return {
      ...node,
      children: [...node.children, createNoteTreeNode(noteId)],
    };
  });
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
): FolderTreeNode | null {
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
