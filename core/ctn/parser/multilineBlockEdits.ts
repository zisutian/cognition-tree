// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnEditableBlock } from "./types.ts";

export type CtnMultilineIndentDirection = "indent" | "outdent";

export type CtnMultilineLinePrefixEdit = {
  lineNumber: number;
  nextPrefix: string;
  previousPrefix: string;
};

function getOutdentedPrefix(indentText: string) {
  if (indentText.endsWith("\t")) {
    return indentText.slice(0, -1);
  }

  return null;
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
  const endLineNumber = Math.min(block.lexicalEndLineNumber, lines.length);

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
