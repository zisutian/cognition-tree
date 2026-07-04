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
    textColor: rule.textColor,
    tone: rule.tone,
    lineNumber,
    startColumn,
    endColumn: textStartColumn + endOffset,
    text,
  };
}

type InlineRangeBoundary = {
  endOffset: number;
  startOffset: number;
};

function collectPairedRuleBoundaries(
  text: string,
  inlineRules: CtnInlineRule[],
): InlineRangeBoundary[] {
  const pairedRules = inlineRules.filter((rule) => rule.kind === "paired");
  const boundaries: InlineRangeBoundary[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const rule = pairedRules.find((candidate) =>
      text.startsWith(candidate.open, index),
    );

    if (!rule) {
      continue;
    }

    const closeIndex = text.indexOf(rule.close, index + rule.open.length);

    if (closeIndex < 0) {
      continue;
    }

    const endOffset = closeIndex + rule.close.length;

    boundaries.push({
      endOffset,
      startOffset: index,
    });
    index = endOffset - 1;
  }

  return boundaries;
}

function isInsideBoundary(offset: number, boundaries: InlineRangeBoundary[]) {
  return boundaries.some(
    (boundary) => offset >= boundary.startOffset && offset < boundary.endOffset,
  );
}

function expandSingleMarkerRange(
  text: string,
  markerStart: number,
  markerEnd: number,
  boundaries: InlineRangeBoundary[],
) {
  let startOffset = markerStart;
  let endOffset = markerEnd;

  while (
    startOffset > 0 &&
    !/\s/.test(text[startOffset - 1]) &&
    !isInsideBoundary(startOffset - 1, boundaries)
  ) {
    startOffset -= 1;
  }

  while (
    endOffset < text.length &&
    !/\s/.test(text[endOffset]) &&
    !isInsideBoundary(endOffset, boundaries)
  ) {
    endOffset += 1;
  }

  return { endOffset, startOffset };
}

export function parseInlineSpans(
  text: string,
  lineNumber: number,
  textStartColumn: number,
  inlineRules: CtnInlineRule[],
): CtnInlineSpan[] {
  const spans: CtnInlineSpan[] = [];
  let index = 0;
  const pairedBoundaries = collectPairedRuleBoundaries(text, inlineRules);
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

    const markerEndOffset = index + matchedRule.marker.length;
    const range = expandSingleMarkerRange(
      text,
      index,
      markerEndOffset,
      pairedBoundaries,
    );

    spans.push(
      createInlineSpan(
        matchedRule,
        lineNumber,
        textStartColumn,
        range.startOffset,
        range.endOffset,
        text.slice(range.startOffset, range.endOffset),
      ),
    );
    index = range.endOffset;
  }

  return spans;
}
