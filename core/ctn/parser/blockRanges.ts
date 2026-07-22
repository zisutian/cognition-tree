// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnMultilineRange } from "./types.ts";

type CtnBlockRange = {
  level: number;
  lexicalEndLineNumber: number;
  subtreeEndLineNumber: number;
  type: string;
};

export function isClosingMultilineFence(
  line: string,
  indentText: string,
  fenceMarker: string,
) {
  if (!fenceMarker || !line.startsWith(`${indentText}${fenceMarker}`)) {
    return false;
  }

  return /^[ \t]*$/.test(line.slice(indentText.length + fenceMarker.length));
}

export function findMultilineRange(
  lines: readonly string[],
  openerLineIndex: number,
  indentText: string,
  fenceMarker: string,
): CtnMultilineRange {
  for (let index = openerLineIndex + 1; index < lines.length; index += 1) {
    if (isClosingMultilineFence(lines[index], indentText, fenceMarker)) {
      return {
        closingFenceLineNumber: index + 1,
        contentEndLineNumber: index,
        contentStartLineNumber: openerLineIndex + 2,
        status: "closed",
      };
    }
  }

  return {
    closingFenceLineNumber: null,
    contentEndLineNumber: lines.length,
    contentStartLineNumber: openerLineIndex + 2,
    status: "unterminated",
  };
}

export function assignBlockSubtreeEndLineNumbers<TBlock extends CtnBlockRange>(
  blocks: TBlock[],
  totalLineCount: number,
  getSourceStartLineNumber: (block: TBlock) => number,
) {
  const openBlocks: TBlock[] = [];

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
        completedBlock.subtreeEndLineNumber = Math.max(
          completedBlock.lexicalEndLineNumber,
          getSourceStartLineNumber(block) - 1,
        );
      }
    }

    openBlocks.push(block);
  }

  for (const block of openBlocks) {
    block.subtreeEndLineNumber = Math.max(
      block.lexicalEndLineNumber,
      totalLineCount,
    );
  }
}
