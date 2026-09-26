import type { StructureTreeNode } from "./types.ts";

export type StructureTreeRow = {
  depth: number;
  node: StructureTreeNode;
  parentId: string | null;
  position: number;
  setSize: number;
};

export function flattenStructureTreeRows(
  nodes: StructureTreeNode[],
  depth = 0,
): StructureTreeRow[] {
  const rows: StructureTreeRow[] = [];
  const pending: StructureTreeRow[] = [];

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    pending.push({
      depth,
      node: nodes[index],
      parentId: null,
      position: index + 1,
      setSize: nodes.length,
    });
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
      pending.push({
        depth: row.depth + 1,
        node: row.node.children[index],
        parentId: row.node.id,
        position: index + 1,
        setSize: row.node.children.length,
      });
    }
  }

  return rows;
}

export function visibleStructureTreeRows(
  rows: StructureTreeRow[],
  collapsedIds: ReadonlySet<string>,
) {
  const visibleIds = new Set<string>();
  const visibleRows: StructureTreeRow[] = [];

  for (const row of rows) {
    if (
      row.parentId !== null &&
      (!visibleIds.has(row.parentId) || collapsedIds.has(row.parentId))
    ) {
      continue;
    }
    visibleIds.add(row.node.id);
    visibleRows.push(row);
  }

  return visibleRows;
}
