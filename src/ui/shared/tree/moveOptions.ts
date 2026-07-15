import { canDropTreeNode, getTreeNodeReference } from "./drag";
import type {
  TreeMoveDestination,
  TreeNode,
  TreeNodeReference,
} from "./types";

export type TreeMoveOption = {
  description: string;
  destination: TreeMoveDestination;
  id: string;
  label: string;
};

function collectFolderMoveOptions({
  nodes,
  parentPath,
  rootNodes,
  source,
}: {
  nodes: TreeNode[];
  parentPath: string[];
  rootNodes: TreeNode[];
  source: TreeNodeReference;
}): TreeMoveOption[] {
  return nodes.flatMap((node) => {
    if (node.kind !== "folder") {
      return [];
    }

    const destination = {
      folderId: node.folderId,
      kind: "inside" as const,
    };
    const currentPath = [...parentPath, node.title];
    const nestedOptions = collectFolderMoveOptions({
      nodes: node.children,
      parentPath: currentPath,
      rootNodes,
      source,
    });

    return canDropTreeNode({ destination, nodes: rootNodes, source })
      ? [
          {
            description: parentPath.length > 0
              ? parentPath.join(" / ")
              : "根级文件夹",
            destination,
            id: `inside:${node.folderId}`,
            label: node.title,
          },
          ...nestedOptions,
        ]
      : nestedOptions;
  });
}

export function createTreeMoveOptions(
  nodes: TreeNode[],
  sourceNode: TreeNode,
): TreeMoveOption[] {
  const source = getTreeNodeReference(sourceNode);

  return [
    {
      description: "工作区根级",
      destination: { kind: "root" },
      id: "root",
      label: "根目录",
    },
    ...collectFolderMoveOptions({
      nodes,
      parentPath: [],
      rootNodes: nodes,
      source,
    }),
  ];
}
