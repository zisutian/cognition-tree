import type { NoteTreeNode } from "../workspaceData";

type PendingNode = {
  node: NoteTreeNode;
  parent: PendingNode | null;
  index: number;
};

function materializePath(entry: PendingNode): number[] {
  const path = new Array<number>(getPendingDepth(entry));
  let cursor: PendingNode | null = entry;

  for (let index = path.length - 1; index >= 0; index -= 1) {
    if (!cursor) {
      throw new Error("Workspace tree path is incomplete.");
    }

    path[index] = cursor.index;
    cursor = cursor.parent;
  }

  return path;
}

function getPendingDepth(entry: PendingNode): number {
  let depth = 0;
  let cursor: PendingNode | null = entry;

  while (cursor) {
    depth += 1;
    cursor = cursor.parent;
  }

  return depth;
}

export function findNoteTreeNodePath(
  tree: readonly NoteTreeNode[],
  predicate: (node: NoteTreeNode) => boolean,
): number[] | null {
  const pending: PendingNode[] = [];

  for (let index = tree.length - 1; index >= 0; index -= 1) {
    pending.push({ index, node: tree[index], parent: null });
  }

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) {
      continue;
    }

    if (predicate(current.node)) {
      return materializePath(current);
    }

    if (current.node.kind === "folder") {
      for (
        let index = current.node.children.length - 1;
        index >= 0;
        index -= 1
      ) {
        pending.push({
          index,
          node: current.node.children[index],
          parent: current,
        });
      }
    }
  }

  return null;
}

export function readNoteTreeNodeAtPath(
  tree: readonly NoteTreeNode[],
  path: readonly number[],
): NoteTreeNode {
  let children = tree;
  let node: NoteTreeNode | undefined;

  for (const index of path) {
    node = children[index];

    if (!node) {
      throw new Error("Workspace tree path does not exist.");
    }

    children = node.kind === "folder" ? node.children : [];
  }

  if (!node) {
    throw new Error("Workspace tree path cannot reference the root collection.");
  }

  return node;
}

export function updateNoteTreeChildrenAtPath(
  tree: readonly NoteTreeNode[],
  parentPath: readonly number[],
  update: (children: readonly NoteTreeNode[]) => NoteTreeNode[],
): NoteTreeNode[] {
  if (parentPath.length === 0) {
    return update(tree);
  }

  const ancestors: Extract<NoteTreeNode, { kind: "folder" }>[] = [];
  let children = tree;

  for (const index of parentPath) {
    const node = children[index];

    if (!node || node.kind !== "folder") {
      throw new Error("Workspace tree parent path does not reference a folder.");
    }

    ancestors.push(node);
    children = node.children;
  }

  let nextChildren = update(children);

  for (let depth = ancestors.length - 1; depth >= 0; depth -= 1) {
    const parent = ancestors[depth];
    const parentChildren =
      depth === 0
        ? tree
        : ancestors[depth - 1].children;
    const parentIndex = parentPath[depth];

    nextChildren = [
      ...parentChildren.slice(0, parentIndex),
      { ...parent, children: nextChildren },
      ...parentChildren.slice(parentIndex + 1),
    ];
  }

  return nextChildren;
}

export function removeNoteTreeNodeAtPath(
  tree: readonly NoteTreeNode[],
  path: readonly number[],
): { node: NoteTreeNode; tree: NoteTreeNode[] } {
  if (path.length === 0) {
    throw new Error("Workspace tree node path is required.");
  }

  const node = readNoteTreeNodeAtPath(tree, path);
  const parentPath = path.slice(0, -1);
  const nodeIndex = path[path.length - 1];
  const nextTree = updateNoteTreeChildrenAtPath(tree, parentPath, (children) => [
    ...children.slice(0, nodeIndex),
    ...children.slice(nodeIndex + 1),
  ]);

  return { node, tree: nextTree };
}

export function insertNoteTreeNodeAtPath(
  tree: readonly NoteTreeNode[],
  parentPath: readonly number[],
  node: NoteTreeNode,
  index?: number,
): NoteTreeNode[] {
  return updateNoteTreeChildrenAtPath(tree, parentPath, (children) => {
    const insertionIndex = index ?? children.length;

    if (insertionIndex < 0 || insertionIndex > children.length) {
      throw new Error("Workspace tree insertion index is out of bounds.");
    }

    return [
      ...children.slice(0, insertionIndex),
      node,
      ...children.slice(insertionIndex),
    ];
  });
}

export function replaceNoteTreeNodeAtPath(
  tree: readonly NoteTreeNode[],
  path: readonly number[],
  replacement: NoteTreeNode,
): NoteTreeNode[] {
  if (path.length === 0) {
    throw new Error("Workspace tree node path is required.");
  }

  const parentPath = path.slice(0, -1);
  const nodeIndex = path[path.length - 1];

  return updateNoteTreeChildrenAtPath(tree, parentPath, (children) => [
    ...children.slice(0, nodeIndex),
    replacement,
    ...children.slice(nodeIndex + 1),
  ]);
}
