import type { StructureTreeNode } from "./types.ts";

export type StructureTreeRow = {
  depth: number;
  node: StructureTreeNode;
};

export function flattenStructureTreeRows(
  nodes: StructureTreeNode[],
  depth = 0,
): StructureTreeRow[] {
  const rows: StructureTreeRow[] = [];
  const pending: StructureTreeRow[] = [];

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    pending.push({ depth, node: nodes[index] });
  }

  while (pending.length > 0) {
    const row = pending.pop();

    if (!row) {
      continue;
    }

    rows.push(row);

    for (
      let index = row.node.children.length - 1;
      index >= 0;
      index -= 1
    ) {
      pending.push({ depth: row.depth + 1, node: row.node.children[index] });
    }
  }

  return rows;
}
