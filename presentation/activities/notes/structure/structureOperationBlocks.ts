import { useMemo } from "react";
import {
  flattenUiBlockSubtree,
  type UiBlockNode,
} from "../../../../application/workspace/index.ts";

export function findBlockById(
  blocks: readonly UiBlockNode[],
  nodeId: string | null,
): UiBlockNode | null {
  if (!nodeId) return null;
  const pending = [...blocks].reverse();
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    if (node.id === nodeId) return node;
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push(node.children[index]);
    }
  }
  return null;
}

export function useSelectedBlockIds(block: UiBlockNode | null) {
  return useMemo(
    () => new Set(block ? flattenUiBlockSubtree(block).map((node) => node.id) : []),
    [block],
  );
}
