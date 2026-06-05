import type { CtnBlock } from "./types";

export function findClosingCodeFenceLineNumber(
  lines: string[],
  startIndex: number,
): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index].trim().startsWith("```")) {
      return index + 1;
    }
  }

  return lines.length;
}

export function assignBlockEndLineNumbers(
  blocks: CtnBlock[],
  totalLineCount: number,
) {
  blocks.forEach((block, blockIndex) => {
    let subtreeEndLineNumber = totalLineCount;

    for (
      let nextBlockIndex = blockIndex + 1;
      nextBlockIndex < blocks.length;
      nextBlockIndex += 1
    ) {
      const nextBlock = blocks[nextBlockIndex];

      if (nextBlock.level <= block.level) {
        subtreeEndLineNumber = nextBlock.lineNumber - 1;
        break;
      }
    }

    block.endLineNumber = Math.max(block.endLineNumber, subtreeEndLineNumber);
  });
}
