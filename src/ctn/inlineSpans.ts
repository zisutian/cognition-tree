import type { CtnInlineSpan, CtnInlineSpanType } from "./types";

function createInlineSpan(
  type: CtnInlineSpanType,
  lineNumber: number,
  textStartColumn: number,
  startOffset: number,
  endOffset: number,
  text: string,
): CtnInlineSpan {
  const startColumn = textStartColumn + startOffset;

  return {
    id: `${lineNumber}-${startColumn}-${type}`,
    type,
    lineNumber,
    startColumn,
    endColumn: textStartColumn + endOffset,
    text,
  };
}

export function parseInlineSpans(
  text: string,
  lineNumber: number,
  textStartColumn: number,
): CtnInlineSpan[] {
  const spans: CtnInlineSpan[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] === "`") {
      const closeIndex = text.indexOf("`", index + 1);

      if (closeIndex >= 0) {
        spans.push(
          createInlineSpan(
            "inline-code",
            lineNumber,
            textStartColumn,
            index,
            closeIndex + 1,
            text.slice(index + 1, closeIndex),
          ),
        );
        index = closeIndex + 1;
        continue;
      }
    }

    if (text.startsWith("[[", index)) {
      const closeIndex = text.indexOf("]]", index + 2);

      if (closeIndex >= 0) {
        spans.push(
          createInlineSpan(
            "global-reference",
            lineNumber,
            textStartColumn,
            index,
            closeIndex + 2,
            text.slice(index + 2, closeIndex),
          ),
        );
        index = closeIndex + 2;
        continue;
      }
    }

    if (text[index] === "<") {
      const closeIndex = text.indexOf(">", index + 1);

      if (closeIndex >= 0) {
        spans.push(
          createInlineSpan(
            "local-reference",
            lineNumber,
            textStartColumn,
            index,
            closeIndex + 1,
            text.slice(index + 1, closeIndex),
          ),
        );
        index = closeIndex + 1;
        continue;
      }
    }

    if (text[index] === "\\") {
      spans.push(
        createInlineSpan(
          "parallel-separator",
          lineNumber,
          textStartColumn,
          index,
          index + 1,
          "\\",
        ),
      );
      index += 1;
      continue;
    }

    index += 1;
  }

  return spans;
}
