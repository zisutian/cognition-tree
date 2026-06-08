import type { CtnInlineRule } from "../syntax/types";
import type { CtnInlineSpan } from "./types";

function createInlineSpan(
  rule: CtnInlineRule,
  lineNumber: number,
  textStartColumn: number,
  startOffset: number,
  endOffset: number,
  text: string,
): CtnInlineSpan {
  const startColumn = textStartColumn + startOffset;

  return {
    id: `${lineNumber}-${startColumn}-${rule.type}`,
    type: rule.type,
    label: rule.label,
    tone: rule.tone,
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
  inlineRules: CtnInlineRule[],
): CtnInlineSpan[] {
  const spans: CtnInlineSpan[] = [];
  let index = 0;
  const sortedRules = [...inlineRules].sort((left, right) => {
    const leftLength = left.kind === "paired" ? left.open.length : left.marker.length;
    const rightLength =
      right.kind === "paired" ? right.open.length : right.marker.length;

    return rightLength - leftLength;
  });

  while (index < text.length) {
    const matchedRule = sortedRules.find((rule) =>
      rule.kind === "paired"
        ? text.startsWith(rule.open, index)
        : text.startsWith(rule.marker, index),
    );

    if (!matchedRule) {
      index += 1;
      continue;
    }

    if (matchedRule.kind === "paired") {
      const closeIndex = text.indexOf(
        matchedRule.close,
        index + matchedRule.open.length,
      );

      if (closeIndex >= 0) {
        const endOffset = closeIndex + matchedRule.close.length;

        spans.push(
          createInlineSpan(
            matchedRule,
            lineNumber,
            textStartColumn,
            index,
            endOffset,
            text.slice(index + matchedRule.open.length, closeIndex),
          ),
        );
        index = endOffset;
        continue;
      }

      index += matchedRule.open.length;
      continue;
    }

    spans.push(
      createInlineSpan(
        matchedRule,
        lineNumber,
        textStartColumn,
        index,
        index + matchedRule.marker.length,
        matchedRule.marker,
      ),
    );
    index += matchedRule.marker.length;
  }

  return spans;
}
