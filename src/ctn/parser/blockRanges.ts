import type { CtnBlock } from "./types";

export function findClosingMultilineFenceLineNumber(
  lines: string[],
  startIndex: number,
  fenceMarker: string,
): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index].trim().startsWith(fenceMarker)) {
      return index + 1;
    }
  }

  return lines.length;
}

export function assignBlockEndLineNumbers(
  blocks: CtnBlock[],
  totalLineCount: number,
) {
  const openBlocks: CtnBlock[] = [];

  for (const block of blocks) {
    if (block.type === "title") {
      continue;
    }

    while (
      openBlocks.length > 0 &&
      openBlocks[openBlocks.length - 1].level >= block.level
    ) {
      const completedBlock = openBlocks.pop();

      if (completedBlock) {
        completedBlock.endLineNumber = Math.max(
          completedBlock.endLineNumber,
          block.lineNumber - 1,
        );
      }
    }

    openBlocks.push(block);
  }

  for (const block of openBlocks) {
    block.endLineNumber = Math.max(block.endLineNumber, totalLineCount);
  }
}
