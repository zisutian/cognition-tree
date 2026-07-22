// SPDX-License-Identifier: GPL-3.0-or-later

import {
  formatCtnBlockMetadataLine,
  parseCtnBlockMetadataLine,
} from "../metadata/blockMetadata.ts";
import type { CtnSyntaxProfile } from "../syntax/types.ts";
import { isClosingMultilineFence } from "./blockRanges.ts";
import { parseMarker, sortMarkerRules } from "./lineMarkers.ts";
import { parseCtnCanonicalDocument } from "./parseCtnDocument.ts";
import type {
  CtnCanonicalBlock,
  CtnCanonicalDocument,
} from "./types.ts";

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
  sourceText: string;
  syntaxProfile: CtnSyntaxProfile;
  targetPosition: CtnBlockTextTargetPosition;
  targetText: string;
  updatedAt: string;
};

export type MoveCtnBlockTextResult = {
  nextSourceText: string;
  nextTargetText: string;
  status: "moved";
};

export type MoveCtnBlockWithinTextInput = {
  sourceBlock: CtnBlockTextRange;
  sourceText: string;
  syntaxProfile: CtnSyntaxProfile;
  targetPosition: CtnBlockTextTargetPosition;
  updatedAt: string;
};

export type MoveCtnBlockWithinTextResult = {
  nextText: string;
  status: "moved";
};

const indentUnit = "\t";

function splitDocumentLines(source: string) {
  return source.length === 0 ? [] : source.split("\n");
}

function assertValidRange(source: string, range: BlockLineRange) {
  const lineCount = splitDocumentLines(source).length;

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

function extractBlockText(source: string, range: BlockLineRange) {
  assertValidRange(source, range);

  return splitDocumentLines(source)
    .slice(range.startLineNumber - 1, range.endLineNumber)
    .join("\n");
}

function removeBlockText(source: string, range: BlockLineRange) {
  assertValidRange(source, range);

  const lines = splitDocumentLines(source);
  lines.splice(
    range.startLineNumber - 1,
    range.endLineNumber - range.startLineNumber + 1,
  );

  return lines.join("\n");
}

function insertBlockTextBeforeLine(
  source: string,
  blockText: string,
  lineNumber: number,
) {
  const lines = splitDocumentLines(source);
  const blockLines = splitDocumentLines(blockText);
  const insertionIndex = Math.max(0, Math.min(lineNumber - 1, lines.length));

  if (blockLines.length === 0) {
    return source;
  }

  lines.splice(insertionIndex, 0, ...blockLines);
  return lines.join("\n");
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
  blockText: string,
  fromIndent: string,
  toLevel: number,
  syntaxProfile: CtnSyntaxProfile,
) {
  const toIndent = indentUnit.repeat(Math.max(0, toLevel));
  const markerRules = sortMarkerRules(syntaxProfile.markerRules);
  let expectsSourceLine = false;
  let multiline:
    | {
        fromIndent: string;
        marker: string;
        toIndent: string;
      }
    | null = null;

  return splitDocumentLines(blockText)
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
          markerRules,
        );

        if (marker.role === "multiline" && marker.marker !== null) {
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
    })
    .join("\n");
}

type CanonicalBlockPlacement = {
  childIds: string[];
  parentId: string | null;
  siblingIndex: number;
};

function createCanonicalBlockPlacements(document: CtnCanonicalDocument) {
  const placements = new Map<string, CanonicalBlockPlacement>();
  const pending: Array<{
    block: CtnCanonicalBlock;
    parentId: string | null;
    siblingIndex: number;
  }> = document.roots
    .map((block, siblingIndex) => ({
      block,
      parentId: null,
      siblingIndex,
    }))
    .reverse();

  while (pending.length > 0) {
    const entry = pending.pop();

    if (!entry) {
      continue;
    }

    placements.set(entry.block.id, {
      childIds: entry.block.children.map((child) => child.id),
      parentId: entry.parentId,
      siblingIndex: entry.siblingIndex,
    });

    for (let index = entry.block.children.length - 1; index >= 0; index -= 1) {
      pending.push({
        block: entry.block.children[index],
        parentId: entry.block.id,
        siblingIndex: index,
      });
    }
  }

  return placements;
}

function equalIds(left: readonly string[], right: readonly string[]) {
  return left.length === right.length &&
    left.every((id, index) => id === right[index]);
}

function touchChangedCanonicalBlocks(
  previousSource: string,
  nextSource: string,
  syntaxProfile: CtnSyntaxProfile,
  updatedAt: string,
) {
  const previousDocument = parseCtnCanonicalDocument(
    previousSource,
    syntaxProfile,
  );
  const nextDocument = parseCtnCanonicalDocument(nextSource, syntaxProfile);
  const previousBlockById = new Map(
    previousDocument.blocks.map((block) => [block.id, block]),
  );
  const previousPlacements = createCanonicalBlockPlacements(previousDocument);
  const nextPlacements = createCanonicalBlockPlacements(nextDocument);
  const changedIds = new Set<string>();

  for (const block of nextDocument.blocks) {
    const previousBlock = previousBlockById.get(block.id);
    const previousPlacement = previousPlacements.get(block.id);
    const nextPlacement = nextPlacements.get(block.id);

    if (
      !previousBlock ||
      block.type === "title" ||
      previousBlock.contentFingerprint !== block.contentFingerprint ||
      previousBlock.indentText !== block.indentText ||
      previousPlacement?.parentId !== nextPlacement?.parentId ||
      previousPlacement?.siblingIndex !== nextPlacement?.siblingIndex ||
      !equalIds(
        previousPlacement?.childIds ?? [],
        nextPlacement?.childIds ?? [],
      )
    ) {
      changedIds.add(block.id);
    }
  }

  const lines = nextSource.split("\n");

  for (const block of nextDocument.blocks) {
    if (!changedIds.has(block.id)) {
      continue;
    }

    lines[block.metadataLineNumber - 1] = formatCtnBlockMetadataLine({
      id: block.id,
      indentText: block.indentText,
      ...block.metadata,
      updatedAt,
    });
  }

  const touchedSource = lines.join("\n");
  parseCtnCanonicalDocument(touchedSource, syntaxProfile);
  return touchedSource;
}

function getDocumentAppendLineNumber(source: string) {
  if (source.length === 0) {
    return 1;
  }

  const lineCount = splitDocumentLines(source).length;
  return source.endsWith("\n") ? lineCount : lineCount + 1;
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
  targetText: string,
  targetPosition: CtnBlockTextTargetPosition,
) {
  switch (targetPosition.kind) {
    case "inside-block":
    case "sibling-below":
      return targetPosition.block.subtreeEndLineNumber + 1;
    case "sibling-above":
      return targetPosition.block.metadataLineNumber;
    case "end":
      return getDocumentAppendLineNumber(targetText);
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
  const extractedText = extractBlockText(input.sourceText, sourceRange);
  const rewrittenText = rewriteBlockIndent(
    extractedText,
    input.sourceBlock.indentText,
    getTargetLevel(input.targetPosition),
    input.syntaxProfile,
  );
  const movedSourceText = removeBlockText(input.sourceText, sourceRange);
  const movedTargetText = insertBlockTextBeforeLine(
    input.targetText,
    rewrittenText,
    getTargetInsertionLineNumber(input.targetText, input.targetPosition),
  );
  const nextSourceText = touchChangedCanonicalBlocks(
    input.sourceText,
    movedSourceText,
    input.syntaxProfile,
    input.updatedAt,
  );
  const nextTargetText = touchChangedCanonicalBlocks(
    input.targetText,
    movedTargetText,
    input.syntaxProfile,
    input.updatedAt,
  );

  return {
    nextSourceText,
    nextTargetText,
    status: "moved",
  };
}

export function moveCtnBlockWithinText(
  input: MoveCtnBlockWithinTextInput,
): MoveCtnBlockWithinTextResult {
  const sourceRange = getBlockLineRange(input.sourceBlock);
  assertTargetOutsideSourceRange(sourceRange, input.targetPosition);

  const extractedText = extractBlockText(input.sourceText, sourceRange);
  const rewrittenText = rewriteBlockIndent(
    extractedText,
    input.sourceBlock.indentText,
    getTargetLevel(input.targetPosition),
    input.syntaxProfile,
  );
  const insertionLineNumber = adjustInsertionLineNumberAfterRemoval(
    getTargetInsertionLineNumber(input.sourceText, input.targetPosition),
    sourceRange,
  );
  const textWithoutSourceBlock = removeBlockText(input.sourceText, sourceRange);
  const movedText = insertBlockTextBeforeLine(
    textWithoutSourceBlock,
    rewrittenText,
    insertionLineNumber,
  );
  const nextText = touchChangedCanonicalBlocks(
    input.sourceText,
    movedText,
    input.syntaxProfile,
    input.updatedAt,
  );

  return {
    nextText,
    status: "moved",
  };
}
