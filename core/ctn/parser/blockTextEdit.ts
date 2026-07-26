// SPDX-License-Identifier: GPL-3.0-or-later

import {
  formatCtnBlockMetadataLine,
  parseCtnBlockMetadataLine,
} from "../metadata/blockMetadata.ts";
import {
  analyzeCtnCanonicalMutation,
} from "../analysis/canonicalMutation.ts";
import type {
  CtnCanonicalSourceAnalysis,
} from "../analysis/sourceAnalysis.ts";
import type { CtnSourceText } from "../analysis/sourceText.ts";
import { isClosingMultilineFence } from "./blockRanges.ts";
import { parseMarker } from "./lineMarkers.ts";

type BlockLineRange = {
  endLineNumber: number;
  startLineNumber: number;
};

export type CtnBlockTextRange = {
  indentText: string;
  level: number;
  lineNumber: number;
  metadataLineNumber: number;
  subtreeEndLineNumber: number;
};

export type CtnBlockTextTargetPosition =
  | {
      kind: "end";
    }
  | {
      block: CtnBlockTextRange;
      kind: "inside-block";
    }
  | {
      block: CtnBlockTextRange;
      kind: "sibling-above";
    }
  | {
      block: CtnBlockTextRange;
      kind: "sibling-below";
    };

export type MoveCtnBlockTextInput = {
  sourceBlock: CtnBlockTextRange;
  sourceAnalysis: CtnCanonicalSourceAnalysis;
  targetPosition: CtnBlockTextTargetPosition;
  targetAnalysis: CtnCanonicalSourceAnalysis;
  updatedAt: string;
};

export type MoveCtnBlockTextResult = {
  nextSourceAnalysis: CtnCanonicalSourceAnalysis;
  nextSourceText: string;
  nextTargetAnalysis: CtnCanonicalSourceAnalysis;
  nextTargetText: string;
  status: "moved";
};

export type MoveCtnBlockWithinTextInput = {
  sourceBlock: CtnBlockTextRange;
  analysis: CtnCanonicalSourceAnalysis;
  targetPosition: CtnBlockTextTargetPosition;
  updatedAt: string;
};

export type MoveCtnBlockWithinTextResult = {
  analysis: CtnCanonicalSourceAnalysis;
  nextText: string;
  status: "moved";
};

const indentUnit = "\t";

function assertValidRange(lines: readonly string[], range: BlockLineRange) {
  const lineCount = lines.length;

  if (
    range.startLineNumber < 1 ||
    range.endLineNumber < range.startLineNumber ||
    range.endLineNumber > lineCount
  ) {
    throw new Error(
      `Invalid block line range ${range.startLineNumber}-${range.endLineNumber}.`,
    );
  }
}

function getBlockLineRange(block: CtnBlockTextRange): BlockLineRange {
  return {
    endLineNumber: block.subtreeEndLineNumber,
    startLineNumber: block.metadataLineNumber,
  };
}

function extractBlockLines(
  lines: readonly string[],
  range: BlockLineRange,
) {
  assertValidRange(lines, range);

  return lines.slice(range.startLineNumber - 1, range.endLineNumber);
}

function removeBlockLines(
  sourceLines: readonly string[],
  range: BlockLineRange,
) {
  assertValidRange(sourceLines, range);

  const lines = [...sourceLines];
  lines.splice(
    range.startLineNumber - 1,
    range.endLineNumber - range.startLineNumber + 1,
  );

  return lines;
}

function insertBlockLinesBeforeLine(
  sourceLines: readonly string[],
  blockLines: readonly string[],
  lineNumber: number,
) {
  const lines = [...sourceLines];
  const insertionIndex = Math.max(0, Math.min(lineNumber - 1, lines.length));

  if (blockLines.length === 0) {
    return lines;
  }

  lines.splice(insertionIndex, 0, ...blockLines);
  return lines;
}

function rewriteStructuralIndent(
  value: string,
  fromIndent: string,
  toIndent: string,
) {
  return value.startsWith(fromIndent)
    ? `${toIndent}${value.slice(fromIndent.length)}`
    : value;
}

function rewriteMultilineBodyIndent(
  line: string,
  fromIndent: string,
  toIndent: string,
) {
  if (!line || !line.startsWith(fromIndent)) {
    return line;
  }

  return `${toIndent}${line.slice(fromIndent.length)}`;
}

function rewriteBlockIndent(
  blockLines: readonly string[],
  fromIndent: string,
  toLevel: number,
  analysis: CtnCanonicalSourceAnalysis,
) {
  const toIndent = indentUnit.repeat(Math.max(0, toLevel));
  let expectsSourceLine = false;
  let multiline:
    | {
        fromIndent: string;
        marker: string;
        toIndent: string;
      }
    | null = null;

  return blockLines
    .map((line) => {
      if (multiline) {
        if (isClosingMultilineFence(line, multiline.fromIndent, multiline.marker)) {
          const trailingWhitespace = line.slice(
            multiline.fromIndent.length + multiline.marker.length,
          );
          const rewrittenLine =
            `${multiline.toIndent}${multiline.marker}${trailingWhitespace}`;

          multiline = null;
          return rewrittenLine;
        }

        return rewriteMultilineBodyIndent(
          line,
          multiline.fromIndent,
          multiline.toIndent,
        );
      }

      if (expectsSourceLine) {
        expectsSourceLine = false;
        const rewrittenLine = rewriteStructuralIndent(
          line,
          fromIndent,
          toIndent,
        );
        const rewrittenIndent = rewrittenLine.match(/^\s*/)?.[0] ?? "";
        const marker = parseMarker(
          rewrittenLine.trim(),
          1,
          rewrittenIndent.length,
          analysis.syntax.blockMatcher,
        );

        if (marker.rule?.kind === "multiline" && marker.marker !== null) {
          multiline = {
            fromIndent: line.match(/^\s*/)?.[0] ?? "",
            marker: marker.marker,
            toIndent: rewrittenIndent,
          };
        }

        return rewrittenLine;
      }

      if (!line.trim()) {
        return line;
      }

      const metadata = parseCtnBlockMetadataLine(line);

      if (!metadata) {
        throw new Error("Expected canonical CTN block metadata while moving text.");
      }

      expectsSourceLine = true;
      return formatCtnBlockMetadataLine({
        ...metadata,
        indentText: rewriteStructuralIndent(
          metadata.indentText,
          fromIndent,
          toIndent,
        ),
      });
    });
}

function getDocumentAppendLineNumber(
  sourceText: Pick<CtnSourceText, "lines" | "source">,
) {
  if (sourceText.source.length === 0) {
    return 1;
  }

  const lineCount = sourceText.lines.length;
  return sourceText.source.endsWith("\n") ? lineCount : lineCount + 1;
}

function getTargetLevel(targetPosition: CtnBlockTextTargetPosition) {
  switch (targetPosition.kind) {
    case "inside-block":
      return targetPosition.block.level + 1;
    case "sibling-above":
    case "sibling-below":
      return targetPosition.block.level;
    case "end":
      return 0;
  }
}

function getTargetInsertionLineNumber(
  targetAnalysis: CtnCanonicalSourceAnalysis,
  targetPosition: CtnBlockTextTargetPosition,
) {
  switch (targetPosition.kind) {
    case "inside-block":
    case "sibling-below":
      return targetPosition.block.subtreeEndLineNumber + 1;
    case "sibling-above":
      return targetPosition.block.metadataLineNumber;
    case "end":
      return getDocumentAppendLineNumber(targetAnalysis.sourceText);
  }
}

function isBlockInsideLineRange(
  block: CtnBlockTextRange,
  range: BlockLineRange,
) {
  return (
    block.metadataLineNumber >= range.startLineNumber &&
    block.metadataLineNumber <= range.endLineNumber
  );
}

function assertTargetOutsideSourceRange(
  sourceRange: BlockLineRange,
  targetPosition: CtnBlockTextTargetPosition,
) {
  if (targetPosition.kind === "end") {
    return;
  }

  if (isBlockInsideLineRange(targetPosition.block, sourceRange)) {
    throw new Error("Cannot move a CTN block into its own subtree.");
  }
}

function adjustInsertionLineNumberAfterRemoval(
  insertionLineNumber: number,
  removedRange: BlockLineRange,
) {
  if (insertionLineNumber > removedRange.endLineNumber) {
    return insertionLineNumber -
      (removedRange.endLineNumber - removedRange.startLineNumber + 1);
  }

  return insertionLineNumber;
}

export function moveCtnBlockText(
  input: MoveCtnBlockTextInput,
): MoveCtnBlockTextResult {
  const sourceRange = getBlockLineRange(input.sourceBlock);
  const extractedLines = extractBlockLines(
    input.sourceAnalysis.sourceText.values,
    sourceRange,
  );
  const rewrittenLines = rewriteBlockIndent(
    extractedLines,
    input.sourceBlock.indentText,
    getTargetLevel(input.targetPosition),
    input.sourceAnalysis,
  );
  const movedSourceText = removeBlockLines(
    input.sourceAnalysis.sourceText.values,
    sourceRange,
  ).join("\n");
  const movedTargetText = insertBlockLinesBeforeLine(
    input.targetAnalysis.sourceText.values,
    rewrittenLines,
    getTargetInsertionLineNumber(
      input.targetAnalysis,
      input.targetPosition,
    ),
  ).join("\n");
  const nextSourceAnalysis = analyzeCtnCanonicalMutation(
    input.sourceAnalysis,
    movedSourceText,
    {
      touchTitle: true,
      updatedAt: input.updatedAt,
    },
  );
  const nextTargetAnalysis = analyzeCtnCanonicalMutation(
    input.targetAnalysis,
    movedTargetText,
    {
      touchTitle: true,
      updatedAt: input.updatedAt,
    },
  );

  return {
    nextSourceAnalysis,
    nextSourceText: nextSourceAnalysis.sourceText.source,
    nextTargetAnalysis,
    nextTargetText: nextTargetAnalysis.sourceText.source,
    status: "moved",
  };
}

export function moveCtnBlockWithinText(
  input: MoveCtnBlockWithinTextInput,
): MoveCtnBlockWithinTextResult {
  const sourceRange = getBlockLineRange(input.sourceBlock);
  assertTargetOutsideSourceRange(sourceRange, input.targetPosition);

  const extractedLines = extractBlockLines(
    input.analysis.sourceText.values,
    sourceRange,
  );
  const rewrittenLines = rewriteBlockIndent(
    extractedLines,
    input.sourceBlock.indentText,
    getTargetLevel(input.targetPosition),
    input.analysis,
  );
  const insertionLineNumber = adjustInsertionLineNumberAfterRemoval(
    getTargetInsertionLineNumber(input.analysis, input.targetPosition),
    sourceRange,
  );
  const textWithoutSourceBlock = removeBlockLines(
    input.analysis.sourceText.values,
    sourceRange,
  );
  const movedText = insertBlockLinesBeforeLine(
    textWithoutSourceBlock,
    rewrittenLines,
    insertionLineNumber,
  ).join("\n");
  const analysis = analyzeCtnCanonicalMutation(
    input.analysis,
    movedText,
    {
      touchTitle: true,
      updatedAt: input.updatedAt,
    },
  );

  return {
    analysis,
    nextText: analysis.sourceText.source,
    status: "moved",
  };
}
