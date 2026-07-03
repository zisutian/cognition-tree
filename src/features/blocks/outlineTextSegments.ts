import type { CtnSyntaxTone } from "../../ctn-syntax/types";
import type { OutlineNode } from "../../ctn-parser/types";

export type OutlineTextSegment =
  | {
      id: string;
      kind: "text";
      text: string;
    }
    | {
      id: string;
      kind: "inline";
      text: string;
      textColor: CtnSyntaxTone;
      tone: CtnSyntaxTone;
    };

function getNodeTextStartIndex(node: OutlineNode) {
  let textStart = node.indentText.length;

  if (node.marker) {
    const markerStart = node.rawText.indexOf(node.marker, textStart);

    if (markerStart >= 0) {
      textStart = markerStart + node.marker.length;
    }
  }

  while (textStart < node.rawText.length && /\s/.test(node.rawText[textStart])) {
    textStart += 1;
  }

  return textStart;
}

function clampOffset(offset: number, textLength: number) {
  return Math.min(textLength, Math.max(0, offset));
}

function getInlineDisplayText(sourceText: string, parsedText: string) {
  if (!parsedText || sourceText === parsedText) {
    return sourceText;
  }

  const parsedTextStart = sourceText.indexOf(parsedText);

  return parsedTextStart >= 0 ? parsedText : sourceText;
}

export function createOutlineTextSegments(
  node: OutlineNode,
): OutlineTextSegment[] {
  const textStartColumn = getNodeTextStartIndex(node) + 1;
  const spans = [...node.inlineSpans].sort(
    (left, right) =>
      left.startColumn - right.startColumn || left.endColumn - right.endColumn,
  );
  const segments: OutlineTextSegment[] = [];
  let cursor = 0;

  spans.forEach((span) => {
    const spanStart = clampOffset(
      span.startColumn - textStartColumn,
      node.text.length,
    );
    const spanEnd = clampOffset(span.endColumn - textStartColumn, node.text.length);

    if (spanStart < cursor || spanStart >= spanEnd) {
      return;
    }

    if (cursor < spanStart) {
      segments.push({
        id: `${node.id}-text-${cursor}`,
        kind: "text",
        text: node.text.slice(cursor, spanStart),
      });
    }

    const sourceText = node.text.slice(spanStart, spanEnd);
    const displayText = getInlineDisplayText(sourceText, span.text);

    if (displayText) {
      segments.push({
        id: span.id,
        kind: "inline",
        text: displayText,
        textColor: span.textColor,
        tone: span.tone,
      });
    }

    cursor = spanEnd;
  });

  if (cursor < node.text.length) {
    segments.push({
      id: `${node.id}-text-${cursor}`,
      kind: "text",
      text: node.text.slice(cursor),
    });
  }

  return segments.length > 0
    ? segments
    : [{ id: `${node.id}-text-empty`, kind: "text", text: node.text }];
}

export function getOutlineDisplayText(node: OutlineNode) {
  return createOutlineTextSegments(node)
    .map((segment) => segment.text)
    .join("");
}
