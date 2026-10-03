// SPDX-License-Identifier: GPL-3.0-or-later

import {
  formatCtnBlockMetadataLine,
  parseCtnBlockMetadataLine,
} from "../metadata/blockMetadata.ts";
import { analyzeCtnCanonicalMutation } from "../analysis/canonicalMutation.ts";
import type { CtnCanonicalSourceAnalysis } from "../analysis/sourceAnalysis.ts";
import type { CtnSourceText } from "../analysis/sourceText.ts";
import type { CtnCanonicalBlock } from "./types.ts";
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
  touchTitle?: boolean;
};

export type MoveCtnBlockWithinTextResult = {
  analysis: CtnCanonicalSourceAnalysis;
  nextText: string;
  status: "moved";
};

export type MoveCtnBlocksTextInput = Omit<MoveCtnBlockTextInput, "sourceBlock"> & {
  sourceBlocks: readonly CtnBlockTextRange[];
};

export type MoveCtnBlocksWithinTextInput = Omit<MoveCtnBlockWithinTextInput, "sourceBlock"> & {
  sourceBlocks: readonly CtnBlockTextRange[];
};

const indentUnit = "\t";

export class CtnBlockMoveValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CtnBlockMoveValidationError";
  }
}

function assertValidRange(lines: readonly string[], range: BlockLineRange) {
  const lineCount = lines.length;

  if (
    range.startLineNumber < 1 ||
    range.endLineNumber < range.startLineNumber ||
    range.endLineNumber > lineCount
  ) {
    throw new CtnBlockMoveValidationError(
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

function extractBlockLines(lines: readonly string[], range: BlockLineRange) {
  assertValidRange(lines, range);

  return lines.slice(range.startLineNumber - 1, range.endLineNumber);
}

function removeBlockRanges(
  sourceLines: readonly string[],
  ranges: readonly BlockLineRange[],
) {
  const lines: string[] = [];
  let cursor = 0;
  for (const range of ranges) {
    for (let index = cursor; index < range.startLineNumber - 1; index += 1) {
      lines.push(sourceLines[index]);
    }
    cursor = range.endLineNumber;
  }
  // Large multiline bodies can exceed the argument limit of Array.push.
  for (let index = cursor; index < sourceLines.length; index += 1) {
    lines.push(sourceLines[index]);
  }
  return lines;
}

function insertBlockLinesBeforeLine(
  sourceLines: readonly string[],
  blockLines: readonly string[],
  lineNumber: number,
) {
  const insertionIndex = Math.max(0, Math.min(lineNumber - 1, sourceLines.length));

  return sourceLines.slice(0, insertionIndex).concat(
    blockLines,
    sourceLines.slice(insertionIndex),
  );
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
  let multiline: {
    fromIndent: string;
    marker: string;
    toIndent: string;
  } | null = null;

  return blockLines.map((line) => {
    if (multiline) {
      if (
        isClosingMultilineFence(line, multiline.fromIndent, multiline.marker)
      ) {
        const trailingWhitespace = line.slice(
          multiline.fromIndent.length + multiline.marker.length,
        );
        const rewrittenLine = `${multiline.toIndent}${multiline.marker}${trailingWhitespace}`;

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
      const rewrittenLine = rewriteStructuralIndent(line, fromIndent, toIndent);
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
      throw new Error(
        "Expected canonical CTN block metadata while moving text.",
      );
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
    throw new CtnBlockMoveValidationError("Cannot move a CTN block into its own subtree.");
  }
}

function resolveSourceRoots(
  analysis: CtnCanonicalSourceAnalysis,
  sourceBlocks: readonly CtnBlockTextRange[],
) {
  if (sourceBlocks.length === 0) throw new CtnBlockMoveValidationError("A CTN move requires at least one source block.");
  const canonicalByStart = new Map(analysis.document.blocks.map((block) => [block.metadataLineNumber, block]));
  const sorted = sourceBlocks.map((block) => {
    const current = canonicalByStart.get(block.metadataLineNumber);
    if (!current || current.lineNumber !== block.lineNumber ||
      current.subtreeEndLineNumber !== block.subtreeEndLineNumber || current.indentText !== block.indentText) {
      throw new CtnBlockMoveValidationError("CTN move source no longer matches the current analysis.");
    }
    assertValidRange(analysis.sourceText.values, getBlockLineRange(current));
    return current;
  }).sort((left, right) => left.metadataLineNumber - right.metadataLineNumber);
  const roots: CtnCanonicalBlock[] = [];
  for (const block of sorted) {
    if (roots.at(-1) && block.metadataLineNumber <= roots.at(-1)!.subtreeEndLineNumber) continue;
    roots.push(block);
  }
  return roots;
}

function collectMovedBlockIds(analysis: CtnCanonicalSourceAnalysis, ranges: readonly BlockLineRange[]) {
  const ids = new Set<string>();
  let rangeIndex = 0;
  for (const block of analysis.document.blocks) {
    while (rangeIndex < ranges.length && block.metadataLineNumber > ranges[rangeIndex].endLineNumber) rangeIndex += 1;
    const range = ranges[rangeIndex];
    if (!range || !isBlockInsideLineRange(block, range)) continue;
    if (block.multilineRange?.status === "unterminated") {
      throw new CtnBlockMoveValidationError("Repair the unclosed multiline block before moving its subtree.");
    }
    ids.add(block.id);
  }
  return ids;
}

function prepareBlockRangesMove({
  sourceAnalysis,
  sourceBlocks,
  targetAnalysis,
  targetPosition,
  withinDocument,
}: MoveCtnBlocksTextInput & { withinDocument: boolean }) {
  const roots = resolveSourceRoots(sourceAnalysis, sourceBlocks);
  const ranges = roots.map(getBlockLineRange);
  const movedIds = collectMovedBlockIds(sourceAnalysis, ranges);
  if (targetPosition.kind !== "end") {
    const target = targetAnalysis.document.blocks.find((block) => block.metadataLineNumber === targetPosition.block.metadataLineNumber);
    if (!target || target.lineNumber !== targetPosition.block.lineNumber ||
      target.subtreeEndLineNumber !== targetPosition.block.subtreeEndLineNumber || target.indentText !== targetPosition.block.indentText ||
      target.level !== targetPosition.block.level) {
      throw new CtnBlockMoveValidationError("CTN move target no longer matches the current analysis.");
    }
    if (targetAnalysis.document.blocks.some((block) =>
      block.metadataLineNumber >= target.metadataLineNumber && block.lineNumber <= target.subtreeEndLineNumber &&
      block.multilineRange?.status === "unterminated")) {
      throw new CtnBlockMoveValidationError("Repair the unclosed multiline target before moving blocks.");
    }
  } else if (targetAnalysis.document.blocks.some((block) => block.multilineRange?.status === "unterminated")) {
    throw new CtnBlockMoveValidationError("Repair the unclosed multiline target before appending blocks.");
  }
  if (withinDocument) {
    for (const range of ranges) assertTargetOutsideSourceRange(range, targetPosition);
  }
  if (!withinDocument && targetAnalysis.document.blocks.some((block) => movedIds.has(block.id))) {
    throw new CtnBlockMoveValidationError("Moved CTN block identities already exist in the target document.");
  }
  const rewrittenLines = roots.flatMap((root) => rewriteBlockIndent(
    extractBlockLines(sourceAnalysis.sourceText.values, getBlockLineRange(root)),
    root.indentText,
    getTargetLevel(targetPosition),
    sourceAnalysis,
  ));
  const remaining = removeBlockRanges(sourceAnalysis.sourceText.values, ranges);
  let insertionLineNumber = getTargetInsertionLineNumber(targetAnalysis, targetPosition);
  if (withinDocument) {
    const originalInsertionLine = insertionLineNumber;
    for (const range of ranges) {
      if (originalInsertionLine > range.endLineNumber) {
        insertionLineNumber -= range.endLineNumber - range.startLineNumber + 1;
      }
    }
  }
  return {
    sourceText: remaining.join("\n"),
    targetText: insertBlockLinesBeforeLine(
      withinDocument ? remaining : targetAnalysis.sourceText.values,
      rewrittenLines,
      insertionLineNumber,
    ).join("\n"),
  };
}

export function moveCtnBlockText(
  input: MoveCtnBlockTextInput,
): MoveCtnBlockTextResult {
  return moveCtnBlocksText({ ...input, sourceBlocks: [input.sourceBlock] });
}

export function moveCtnBlocksText(input: MoveCtnBlocksTextInput): MoveCtnBlockTextResult {
  const candidate = prepareBlockRangesMove({ ...input, withinDocument: false });
  const nextSourceAnalysis = analyzeCtnCanonicalMutation(
    input.sourceAnalysis,
    candidate.sourceText,
    {
      touchTitle: true,
      updatedAt: input.updatedAt,
    },
  );
  const nextTargetAnalysis = analyzeCtnCanonicalMutation(
    input.targetAnalysis,
    candidate.targetText,
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
  return moveCtnBlocksWithinText({ ...input, sourceBlocks: [input.sourceBlock] });
}

export function moveCtnBlocksWithinText(input: MoveCtnBlocksWithinTextInput): MoveCtnBlockWithinTextResult {
  const candidate = prepareBlockRangesMove({
    ...input,
    sourceAnalysis: input.analysis,
    targetAnalysis: input.analysis,
    withinDocument: true,
  });
  if (candidate.targetText === input.analysis.sourceText.source) {
    return { analysis: input.analysis, nextText: candidate.targetText, status: "moved" };
  }
  const analysis = analyzeCtnCanonicalMutation(input.analysis, candidate.targetText, {
    touchTitle: input.touchTitle ?? true,
    updatedAt: input.updatedAt,
  });

  return {
    analysis,
    nextText: analysis.sourceText.source,
    status: "moved",
  };
}

export type CtnContentMoveTarget =
  | { kind: "end" }
  | { kind: "inside" | "above" | "below"; targetBlockId: string };

export class CtnContentBlockNotFoundError extends Error {
  readonly blockId: string;
  constructor(blockId: string) {
    super(`Content block does not exist: ${blockId}`);
    this.name = "CtnContentBlockNotFoundError";
    this.blockId = blockId;
  }
}

export function moveCtnContentSubtree(
  analysis: CtnCanonicalSourceAnalysis,
  blockId: string,
  target: CtnContentMoveTarget,
  updatedAt: string,
  touchTitle = true,
) {
  const requireBlock = (id: string): CtnCanonicalBlock => {
    const block = analysis.document.blocks.find((block) => block.id === id);
    if (!block || block.rule.semanticId === analysis.syntax.title.semanticId)
      throw new CtnContentBlockNotFoundError(id);
    return block;
  };
  const targetPosition: CtnBlockTextTargetPosition =
    target.kind === "end"
      ? target
      : {
          block: requireBlock(target.targetBlockId),
          kind:
            target.kind === "inside"
              ? "inside-block"
              : target.kind === "above"
                ? "sibling-above"
                : "sibling-below",
        };
  return moveCtnBlockWithinText({
    analysis,
    sourceBlock: requireBlock(blockId),
    targetPosition,
    updatedAt,
    touchTitle,
  });
}
