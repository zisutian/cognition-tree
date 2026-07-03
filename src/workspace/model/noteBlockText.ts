export type NoteBlockLineRange = {
  endLineNumber: number;
  startLineNumber: number;
};

export type NoteBlockLineRangeSource = {
  endLineNumber: number;
  lineNumber: number;
};

const defaultIndentUnit = "\t";

function splitDocumentLines(source: string) {
  return source.length === 0 ? [] : source.split("\n");
}

function assertValidRange(source: string, range: NoteBlockLineRange) {
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

export function getBlockLineRange(
  block: NoteBlockLineRangeSource,
): NoteBlockLineRange {
  return {
    endLineNumber: block.endLineNumber,
    startLineNumber: block.lineNumber,
  };
}

export function extractBlockText(source: string, range: NoteBlockLineRange) {
  assertValidRange(source, range);

  return splitDocumentLines(source)
    .slice(range.startLineNumber - 1, range.endLineNumber)
    .join("\n");
}

export function removeBlockText(source: string, range: NoteBlockLineRange) {
  assertValidRange(source, range);

  const lines = splitDocumentLines(source);
  lines.splice(
    range.startLineNumber - 1,
    range.endLineNumber - range.startLineNumber + 1,
  );

  return lines.join("\n");
}

export function insertBlockTextBeforeLine(
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

export function rewriteBlockIndent(
  blockText: string,
  fromLevel: number,
  toLevel: number,
  indentUnit = defaultIndentUnit,
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

export function getDocumentAppendLineNumber(source: string) {
  if (source.length === 0) {
    return 1;
  }

  const lineCount = splitDocumentLines(source).length;

  return source.endsWith("\n") ? lineCount : lineCount + 1;
}
