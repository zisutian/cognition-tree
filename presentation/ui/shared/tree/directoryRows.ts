import type { TreeNode } from "./types";

export type DirectoryTreeRow = {
  depth: number;
  node: TreeNode;
};

export function flattenVisibleDirectoryTreeRows(
  nodes: TreeNode[],
  collapsedFolderIds: ReadonlySet<string> = new Set(),
): DirectoryTreeRow[] {
  const rows: DirectoryTreeRow[] = [];
  const pending: DirectoryTreeRow[] = [];

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    pending.push({ depth: 0, node: nodes[index] });
  }

  while (pending.length > 0) {
    const row = pending.pop();

    if (!row) {
      continue;
    }

    rows.push(row);

    if (
      row.node.kind === "folder" &&
      !collapsedFolderIds.has(row.node.folderId)
    ) {
      for (
        let index = row.node.children.length - 1;
        index >= 0;
        index -= 1
      ) {
        pending.push({ depth: row.depth + 1, node: row.node.children[index] });
      }
    }
  }

  return rows;
}
