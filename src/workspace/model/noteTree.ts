import {
  defaultFolderId,
  type FolderId,
  type NoteId,
  type NoteTreeNode,
} from "./workspaceData";

export type NoteTreeFolderNode = Extract<NoteTreeNode, { kind: "folder" }>;
export type NoteTreeNoteNode = Extract<NoteTreeNode, { kind: "note" }>;
export type NoteTreeNodeReference =
  | {
      folderId: FolderId;
      kind: "folder";
    }
  | {
      kind: "note";
      noteId: NoteId;
    };
export type NoteTreeMovePlacement = "after" | "before" | "inside";
export type NoteTreeMoveRequest = {
  placement: NoteTreeMovePlacement;
  source: NoteTreeNodeReference;
  target: NoteTreeNodeReference;
};

type NoteTreeNodeLocation = {
  index: number;
  node: NoteTreeNode;
  parentFolderId: FolderId | null;
};

export function createNoteTreeNoteNode(noteId: NoteId): NoteTreeNoteNode {
  return {
    id: `tree-${noteId}`,
    kind: "note",
    noteId,
  };
}

export function createNoteTreeFolderNode(
  folderId: FolderId,
  title: string,
): NoteTreeFolderNode {
  return {
    id: folderId,
    kind: "folder",
    title,
    children: [],
  };
}

export function appendNoteToWorkspaceTree(
  tree: NoteTreeNode[],
  noteId: NoteId,
  folderId: FolderId,
): NoteTreeNode[] {
  if (!findFolderNode(tree, folderId)) {
    throw new Error(`Workspace folder does not exist: ${folderId}`);
  }

  return appendNoteToWorkspaceTreeUnchecked(tree, noteId, folderId);
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
  parentFolderId: FolderId,
): NoteTreeNode[] {
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
    throw new Error(`Workspace folder does not exist: ${targetFolderId}`);
  }

  const sourceFolderId = findFolderIdContainingNote(tree, noteId);

  if (!sourceFolderId) {
    throw new Error(`Workspace note tree node does not exist: ${noteId}`);
  }

  if (sourceFolderId === targetFolderId) {
    return tree;
  }

  return appendNoteToWorkspaceTree(
    removeNoteFromWorkspaceTree(tree, noteId),
    noteId,
    targetFolderId,
  );
}

function getNoteTreeNodeReferenceId(reference: NoteTreeNodeReference) {
  return reference.kind === "folder" ? reference.folderId : reference.noteId;
}

function isMatchingNoteTreeNode(
  node: NoteTreeNode,
  reference: NoteTreeNodeReference,
) {
  return reference.kind === "folder"
    ? node.kind === "folder" && node.id === reference.folderId
    : node.kind === "note" && node.noteId === reference.noteId;
}

function findNoteTreeNodeLocation(
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

function isFolderNodeDescendantReference(
  node: NoteTreeFolderNode,
  reference: NoteTreeNodeReference,
): boolean {
  return node.children.some((child) => {
    if (isMatchingNoteTreeNode(child, reference)) {
      return true;
    }

    return child.kind === "folder"
      ? isFolderNodeDescendantReference(child, reference)
      : false;
  });
}

function removeNoteTreeNode(
  tree: NoteTreeNode[],
  reference: NoteTreeNodeReference,
): {
  removedNode: NoteTreeNode | null;
  tree: NoteTreeNode[];
} {
  let removedNode: NoteTreeNode | null = null;
  const nextTree = tree.flatMap((node): NoteTreeNode[] => {
    if (isMatchingNoteTreeNode(node, reference)) {
      removedNode = node;
      return [];
    }

    if (node.kind !== "folder") {
      return [node];
    }

    const result = removeNoteTreeNode(node.children, reference);

    if (result.removedNode) {
      removedNode = result.removedNode;
    }

    return [
      {
        ...node,
        children: result.tree,
      },
    ];
  });

  return {
    removedNode,
    tree: nextTree,
  };
}

function insertNoteTreeNodeAtSiblingTarget({
  placement,
  sourceNode,
  targetIndex,
  tree,
}: {
  placement: Exclude<NoteTreeMovePlacement, "inside">;
  sourceNode: NoteTreeNode;
  targetIndex: number;
  tree: NoteTreeNode[];
}) {
  const insertionIndex = placement === "before" ? targetIndex : targetIndex + 1;

  return [
    ...tree.slice(0, insertionIndex),
    sourceNode,
    ...tree.slice(insertionIndex),
  ];
}

function insertNoteTreeNodeInFolder({
  folderId,
  sourceNode,
  tree,
}: {
  folderId: FolderId;
  sourceNode: NoteTreeNode;
  tree: NoteTreeNode[];
}): NoteTreeNode[] {
  return tree.map((node) => {
    if (node.kind !== "folder") {
      return node;
    }

    if (node.id === folderId) {
      return {
        ...node,
        children: [...node.children, sourceNode],
      };
    }

    return {
      ...node,
      children: insertNoteTreeNodeInFolder({
        folderId,
        sourceNode,
        tree: node.children,
      }),
    };
  });
}

function insertNoteTreeNodeNearTarget({
  placement,
  sourceNode,
  target,
  targetIndex,
  tree,
}: {
  placement: Exclude<NoteTreeMovePlacement, "inside">;
  sourceNode: NoteTreeNode;
  target: NoteTreeNodeReference;
  targetIndex: number;
  tree: NoteTreeNode[];
}): NoteTreeNode[] {
  if (tree.some((node) => isMatchingNoteTreeNode(node, target))) {
    return insertNoteTreeNodeAtSiblingTarget({
      placement,
      sourceNode,
      targetIndex,
      tree,
    });
  }

  return tree.map((node) => {
    if (node.kind !== "folder") {
      return node;
    }

    return {
      ...node,
      children: insertNoteTreeNodeNearTarget({
        placement,
        sourceNode,
        target,
        targetIndex,
        tree: node.children,
      }),
    };
  });
}

export function moveNoteTreeNode(
  tree: NoteTreeNode[],
  request: NoteTreeMoveRequest,
): NoteTreeNode[] {
  if (
    request.source.kind === "folder" &&
    request.source.folderId === defaultFolderId
  ) {
    throw new Error("Default workspace folder cannot be moved.");
  }

  const sourceLocation = findNoteTreeNodeLocation(tree, request.source);
  const targetLocation = findNoteTreeNodeLocation(tree, request.target);

  if (!sourceLocation) {
    throw new Error(
      `Workspace tree node does not exist: ${getNoteTreeNodeReferenceId(
        request.source,
      )}`,
    );
  }

  if (isMatchingNoteTreeNode(sourceLocation.node, request.target)) {
    throw new Error("Workspace tree node cannot be moved onto itself.");
  }

  if (
    sourceLocation.node.kind === "folder" &&
    isFolderNodeDescendantReference(sourceLocation.node, request.target)
  ) {
    throw new Error("Workspace folder cannot be moved into itself.");
  }

  if (!targetLocation) {
    throw new Error(
      `Workspace tree node does not exist: ${getNoteTreeNodeReferenceId(
        request.target,
      )}`,
    );
  }

  if (
    request.placement !== "inside" &&
    targetLocation.parentFolderId === null
  ) {
    throw new Error("Workspace tree node cannot be moved outside a folder.");
  }

  const removed = removeNoteTreeNode(tree, request.source);

  if (!removed.removedNode) {
    throw new Error(
      `Workspace tree node does not exist: ${getNoteTreeNodeReferenceId(
        request.source,
      )}`,
    );
  }

  if (request.placement === "inside") {
    if (request.target.kind !== "folder") {
      throw new Error("Workspace tree node can only be moved inside a folder.");
    }

    return insertNoteTreeNodeInFolder({
      folderId: request.target.folderId,
      sourceNode: removed.removedNode,
      tree: removed.tree,
    });
  }

  const nextTargetLocation = findNoteTreeNodeLocation(
    removed.tree,
    request.target,
  );

  if (!nextTargetLocation) {
    throw new Error(
      `Workspace tree node does not exist: ${getNoteTreeNodeReferenceId(
        request.target,
      )}`,
    );
  }

  return insertNoteTreeNodeNearTarget({
    placement: request.placement,
    sourceNode: removed.removedNode,
    target: request.target,
    targetIndex: nextTargetLocation.index,
    tree: removed.tree,
  });
}
