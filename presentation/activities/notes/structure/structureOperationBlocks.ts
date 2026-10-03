import { useEffect, useMemo, useState } from "react";
import { flattenUiBlockSubtree, type UiBlockNode } from "../../../../application/workspace/index.ts";

export function findBlockById(blocks: readonly UiBlockNode[], nodeId: string | null): UiBlockNode | null {
  if (!nodeId) return null;
  const pending = [...blocks];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.id === nodeId) return node;
    for (const child of node.children) pending.push(child);
  }
  return null;
}

/** Selection owns rows only; the domain move carries each selected root's subtree. */
export function useStructureBlockSelection(roots: readonly UiBlockNode[]) {
  const nodeIds = useMemo(() => new Set(roots.flatMap(flattenUiBlockSubtree).map((node) => node.id)), [roots]);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    setSelectedIds((current) => {
      const retained = new Set([...current].filter((id) => nodeIds.has(id)));
      return retained.size === current.size ? current : retained;
    });
  }, [nodeIds]);
  return { selectedIds, setSelectedIds };
}
