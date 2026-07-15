import type { StructureTreeNode } from "./types";

export type StructureTreeRow = {
  depth: number;
  node: StructureTreeNode;
};

export function flattenStructureTreeRows(
  nodes: StructureTreeNode[],
  depth = 0,
): StructureTreeRow[] {
  return nodes.flatMap((node) => [
    { depth, node },
    ...flattenStructureTreeRows(node.children, depth + 1),
  ]);
}
