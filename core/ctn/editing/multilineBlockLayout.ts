// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnClosedMultilineRange,
  CtnEditableBlock,
  CtnEditableDocument,
} from "../parser/types.ts";

export type CtnClosedMultilineBlock = CtnEditableBlock & {
  marker: string;
  multilineRange: CtnClosedMultilineRange;
};

export type CtnSourceLine = {
  from: number;
  number: number;
  text: string;
  to: number;
};

export type CtnMultilineBodySourceLine = CtnSourceLine & {
  basePrefixLength: number;
  visibleFrom: number;
};

export type CtnMultilineSourceLayout = {
  bodyLines: readonly CtnMultilineBodySourceLine[];
  closer: CtnSourceLine | null;
  opener: CtnSourceLine;
};

export type CtnMultilineIndentDirection = "indent" | "outdent";

export type CtnMultilineLinePrefixEdit = {
  lineNumber: number;
  nextPrefix: string;
  previousPrefix: string;
};

export function createCtnSourceLines(source: string): CtnSourceLine[] {
  const values = source.split("\n");
  let offset = 0;

  return values.map((text, index) => {
    const line = {
      from: offset,
      number: index + 1,
      text,
      to: offset + text.length,
    };

    offset = line.to + 1;
    return line;
  });
}

export function getCtnSourceLine(
  lines: readonly CtnSourceLine[],
  lineNumber: number,
) {
  return lines[lineNumber - 1] ?? null;
}

export function getCtnSourceLineAt(
  lines: readonly CtnSourceLine[],
  position: number,
) {
  let low = 0;
  let high = lines.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const line = lines[middle];

    if (position < line.from) {
      high = middle - 1;
    } else if (position > line.to) {
      low = middle + 1;
    } else {
      return line;
    }
  }

  return lines[Math.min(low, lines.length - 1)] ?? null;
}

function getOutdentedPrefix(indentText: string) {
  return indentText.endsWith("\t")
    ? indentText.slice(0, -1)
    : null;
}

export function isClosedCtnMultilineBlock(
  block: CtnEditableBlock,
): block is CtnClosedMultilineBlock {
  return block.role === "multiline" &&
    block.marker !== null &&
    block.multilineRange?.status === "closed";
}

export function findCtnMultilineBlockAtLine(
  document: CtnEditableDocument,
  lineNumber: number,
) {
  let low = 0;
  let high = document.blocks.length - 1;
  let candidate: CtnEditableBlock | null = null;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const block = document.blocks[middle];

    if (block.lineNumber <= lineNumber) {
      candidate = block;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return candidate?.role === "multiline" &&
    lineNumber <= candidate.lexicalEndLineNumber
    ? candidate
    : null;
}

export function getCtnMultilineBodyBasePrefix(
  block: Pick<CtnEditableBlock, "indentText">,
  lineText: string,
) {
  const preferred = `${block.indentText}\t`;

  if (lineText.startsWith(preferred)) {
    return preferred;
  }
  if (block.indentText && lineText.startsWith(block.indentText)) {
    return block.indentText;
  }
  return "";
}

export function createCtnMultilineSourceLayout(
  source: string,
  block: CtnEditableBlock,
): CtnMultilineSourceLayout | null {
  if (block.role !== "multiline" || !block.multilineRange) {
    return null;
  }
  const lines = createCtnSourceLines(source);
  const opener = getCtnSourceLine(lines, block.lineNumber);

  if (!opener) {
    return null;
  }
  const closer = block.multilineRange.closingFenceLineNumber === null
    ? null
    : getCtnSourceLine(
        lines,
        block.multilineRange.closingFenceLineNumber,
      );
  const bodyLines: CtnMultilineBodySourceLine[] = [];

  for (
    let lineNumber = block.multilineRange.contentStartLineNumber;
    lineNumber <= block.multilineRange.contentEndLineNumber;
    lineNumber += 1
  ) {
    const line = getCtnSourceLine(lines, lineNumber);

    if (!line) {
      return null;
    }
    const basePrefixLength = getCtnMultilineBodyBasePrefix(
      block,
      line.text,
    ).length;

    bodyLines.push({
      ...line,
      basePrefixLength,
      visibleFrom: line.from + basePrefixLength,
    });
  }

  return { bodyLines, closer, opener };
}

export function createCtnMultilineStructuralIndentEdits(
  block: Pick<
    CtnEditableBlock,
    "indentText" | "lexicalEndLineNumber" | "lineNumber"
  >,
  lines: readonly string[],
  direction: CtnMultilineIndentDirection,
): CtnMultilineLinePrefixEdit[] {
  const nextBlockIndent = direction === "indent"
    ? `${block.indentText}\t`
    : getOutdentedPrefix(block.indentText);

  if (nextBlockIndent === null || nextBlockIndent === block.indentText) {
    return [];
  }
  const edits: CtnMultilineLinePrefixEdit[] = [];
  const endLineNumber = Math.min(
    block.lexicalEndLineNumber,
    lines.length,
  );

  for (
    let lineNumber = block.lineNumber;
    lineNumber <= endLineNumber;
    lineNumber += 1
  ) {
    const line = lines[lineNumber - 1] ?? "";

    if (!line.startsWith(block.indentText)) {
      continue;
    }
    edits.push({
      lineNumber,
      nextPrefix: nextBlockIndent,
      previousPrefix: block.indentText,
    });
  }

  return edits;
}
