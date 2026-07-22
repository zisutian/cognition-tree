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
  rootNodes,
  source,
}: {
  nodes: TreeNode[];
  rootNodes: TreeNode[];
  source: TreeNodeReference;
}): TreeMoveOption[] {
  const options: TreeMoveOption[] = [];
  const pending: Array<{ node: TreeNode; parentDescription: string }> = [];

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    pending.push({ node: nodes[index], parentDescription: "" });
  }

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current || current.node.kind !== "folder") {
      continue;
    }

    const node = current.node;

    const destination = {
      folderId: node.folderId,
      kind: "inside" as const,
    };

    if (canDropTreeNode({ destination, nodes: rootNodes, source })) {
      options.push({
        description: current.parentDescription || "根级文件夹",
        destination,
        id: `inside:${node.folderId}`,
        label: node.title,
      });
    }

    const nextParentDescription = current.parentDescription
      ? `${current.parentDescription} / ${node.title}`
      : node.title;

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push({
        node: node.children[index],
        parentDescription: nextParentDescription,
      });
    }
  }

  return options;
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
      rootNodes: nodes,
      source,
    }),
  ];
}
