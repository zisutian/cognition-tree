import type { TreeNode } from "./types";

export type DirectoryTreeRow = {
  depth: number;
  node: TreeNode;
};

export function flattenVisibleDirectoryTreeRows(
  nodes: TreeNode[],
  collapsedFolderIds: ReadonlySet<string> = new Set(),
  depth = 0,
): DirectoryTreeRow[] {
  return nodes.flatMap((node) => [
    { depth, node },
    ...(node.kind === "folder" && !collapsedFolderIds.has(node.folderId)
      ? flattenVisibleDirectoryTreeRows(
          node.children,
          collapsedFolderIds,
          depth + 1,
        )
      : []),
  ]);
}
