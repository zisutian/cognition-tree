type BlockLineRange = {
  endLineNumber: number;
  startLineNumber: number;
};

export type BlockMigrationBlock = {
  endLineNumber: number;
  level: number;
  lineNumber: number;
};

export type BlockMigrationTargetPosition =
  | {
      kind: "end";
    }
  | {
      block: BlockMigrationBlock;
      kind: "inside-block";
    }
  | {
      block: BlockMigrationBlock;
      kind: "sibling-above";
    }
  | {
      block: BlockMigrationBlock;
      kind: "sibling-below";
    };

export type MoveNoteBlockTextInput = {
  sourceBlock: BlockMigrationBlock;
  sourceSource: string;
  targetPosition: BlockMigrationTargetPosition;
  targetSource: string;
};

export type MoveNoteBlockTextResult = {
  nextSourceSource: string;
  nextTargetSource: string;
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

function getBlockLineRange(block: BlockMigrationBlock): BlockLineRange {
  return {
    endLineNumber: block.endLineNumber,
    startLineNumber: block.lineNumber,
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

function rewriteBlockIndent(
  blockText: string,
  fromLevel: number,
  toLevel: number,
) {
  const fromIndent = indentUnit.repeat(Math.max(0, fromLevel));
  const toIndent = indentUnit.repeat(Math.max(0, toLevel));

  return splitDocumentLines(blockText)
    .map((line) => {
      if (!line.trim()) {
        return line;
      }

      const relativeLine = line.startsWith(fromIndent)
        ? line.slice(fromIndent.length)
        : line.trimStart();

      return `${toIndent}${relativeLine}`;
    })
    .join("\n");
}

function getDocumentAppendLineNumber(source: string) {
  if (source.length === 0) {
    return 1;
  }

  const lineCount = splitDocumentLines(source).length;

  return source.endsWith("\n") ? lineCount : lineCount + 1;
}

function getTargetLevel(targetPosition: BlockMigrationTargetPosition) {
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
  targetSource: string,
  targetPosition: BlockMigrationTargetPosition,
) {
  switch (targetPosition.kind) {
    case "inside-block":
    case "sibling-below":
      return targetPosition.block.endLineNumber + 1;
    case "sibling-above":
      return targetPosition.block.lineNumber;
    case "end":
      return getDocumentAppendLineNumber(targetSource);
  }
}

export function moveNoteBlockText(
  input: MoveNoteBlockTextInput,
): MoveNoteBlockTextResult {
  const sourceRange = getBlockLineRange(input.sourceBlock);
  const extractedText = extractBlockText(input.sourceSource, sourceRange);
  const rewrittenText = rewriteBlockIndent(
    extractedText,
    input.sourceBlock.level,
    getTargetLevel(input.targetPosition),
  );
  const nextSourceSource = removeBlockText(input.sourceSource, sourceRange);
  const nextTargetSource = insertBlockTextBeforeLine(
    input.targetSource,
    rewrittenText,
    getTargetInsertionLineNumber(input.targetSource, input.targetPosition),
  );

  return {
    nextSourceSource,
    nextTargetSource,
    status: "moved",
  };
}
