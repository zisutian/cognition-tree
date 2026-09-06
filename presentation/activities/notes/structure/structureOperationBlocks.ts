import { useMemo } from "react";
import {
  flattenUiBlockSubtree,
  type UiBlockNode,
} from "../../../../application/workspace/index.ts";

export function findBlockByLineNumber(
  blocks: UiBlockNode[],
  lineNumberValue: string,
) {
  const lineNumber = Number(lineNumberValue);

  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    return null;
  }

  for (const root of blocks) {
    const matchingBlock = flattenUiBlockSubtree(root).find(
      (block) => block.lineNumber === lineNumber,
    );

    if (matchingBlock) {
      return matchingBlock;
    }
  }

  return null;
}

export function useSelectedBlockLines(block: UiBlockNode | null) {
  return useMemo(() => {
    if (!block) {
      return new Set<number>();
    }

    return new Set(
      flattenUiBlockSubtree(block).map((subtreeBlock) => subtreeBlock.lineNumber),
    );
  }, [block]);
}
