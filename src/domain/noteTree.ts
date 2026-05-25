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

export function createFolderTreeNode(
  folderId: FolderId,
  title: string,
): FolderTreeNode {
  return {
    id: folderId,
    kind: "folder",
    title,
    children: [],
  };
}

export function orderNoteTreeNodesFoldersFirst(
  tree: NoteTreeNode[],
): NoteTreeNode[] {
  return [...tree]
    .sort((leftNode, rightNode) => {
      if (leftNode.kind === rightNode.kind) {
        return 0;
      }

      return leftNode.kind === "folder" ? -1 : 1;
    })
    .map((node) => {
      if (node.kind !== "folder") {
        return node;
      }

      return {
        ...node,
        children: orderNoteTreeNodesFoldersFirst(node.children),
      };
    });
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
      children: orderNoteTreeNodesFoldersFirst([
        ...node.children,
        createNoteTreeNode(noteId),
      ]),
    };
  });
}

export function appendFolderToWorkspaceTree(
  tree: NoteTreeNode[],
  folder: FolderTreeNode,
  parentFolderId: FolderId = defaultFolderId,
): NoteTreeNode[] {
  return tree.map((node) => {
    if (node.kind !== "folder") {
      return node;
    }

    if (node.id !== parentFolderId) {
      return {
        ...node,
        children: appendFolderToWorkspaceTree(
          node.children,
          folder,
          parentFolderId,
        ),
      };
    }

    return {
      ...node,
      children: orderNoteTreeNodesFoldersFirst([...node.children, folder]),
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
  targetFolderId: FolderId,
): NoteTreeNode[] {
  if (!findFolderNode(tree, targetFolderId)) {
    return tree;
  }

  if (findFolderIdContainingNote(tree, noteId) === targetFolderId) {
    return tree;
  }

  return appendNoteToWorkspaceTree(
    removeNoteFromWorkspaceTree(tree, noteId),
    noteId,
    targetFolderId,
  );
}
