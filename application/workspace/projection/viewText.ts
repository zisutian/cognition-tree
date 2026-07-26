import type { CtnCanonicalBlock } from "../../../core/ctn/parser/types";

export type UiSyntaxTone = string;

export type UiTextSegment =
  | {
      id: string;
      kind: "text";
      text: string;
    }
  | {
      id: string;
      kind: "inline";
      text: string;
      tone: UiSyntaxTone;
    };

export type UiTextDisplay = {
  displayText: string;
  segments: UiTextSegment[];
  textColor: UiSyntaxTone;
};

function getNodeTextStartIndex(node: CtnCanonicalBlock) {
  return Math.max(0, node.textStartColumn - 1);
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

export function createUiTextSegments(node: CtnCanonicalBlock): UiTextSegment[] {
  const textStartColumn = getNodeTextStartIndex(node) + 1;
  const spans = [...node.inlineSpans].sort(
    (left, right) =>
      left.startColumn - right.startColumn || left.endColumn - right.endColumn,
  );
  const segments: UiTextSegment[] = [];
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
        tone: span.rule.tone,
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

export function getUiTextDisplayText(segments: UiTextSegment[]) {
  return segments.map((segment) => segment.text).join("");
}

export function createUiTextDisplay(node: CtnCanonicalBlock): UiTextDisplay {
  const segments = createUiTextSegments(node);

  return {
    displayText: getUiTextDisplayText(segments),
    segments,
    textColor: node.rule.textColor,
  };
}
