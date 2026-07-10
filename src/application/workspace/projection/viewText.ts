import {
  isCustomSyntaxTone,
} from "../../../ctn/syntax/tones";
import type { CtnBlock } from "../../../ctn/parser/types";

export type UiSyntaxTone = string;

export type UiToneStyle = {
  "--ctn-text-color"?: string;
  "--ctn-tone-color"?: string;
};

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
      textColorClassName: string;
      toneClassName: string;
      style?: UiToneStyle;
    };

export type UiTextDisplay = {
  displayText: string;
  segments: UiTextSegment[];
  style?: UiToneStyle;
  textColorClassName: string;
};

export function getUiSyntaxToneClassName(tone: UiSyntaxTone) {
  return isCustomSyntaxTone(tone) ? "ctn-tone-custom" : `ctn-tone-${tone}`;
}

export function getUiSyntaxTextColorClassName(tone: UiSyntaxTone) {
  return isCustomSyntaxTone(tone)
    ? "ctn-text-color-custom"
    : `ctn-text-color-${tone}`;
}

export function createUiToneStyle(
  tone: UiSyntaxTone,
  textColor: UiSyntaxTone,
): UiToneStyle | undefined {
  const style: UiToneStyle = {};

  if (isCustomSyntaxTone(tone)) {
    style["--ctn-tone-color"] = tone;
  }

  if (isCustomSyntaxTone(textColor)) {
    style["--ctn-text-color"] = textColor;
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

function getNodeTextStartIndex(node: CtnBlock) {
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

export function createUiTextSegments(node: CtnBlock): UiTextSegment[] {
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
        textColorClassName: getUiSyntaxTextColorClassName(span.textColor),
        toneClassName: getUiSyntaxToneClassName(span.tone),
        style: createUiToneStyle(span.tone, span.textColor),
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

export function createUiTextDisplay(node: CtnBlock): UiTextDisplay {
  const segments = createUiTextSegments(node);

  return {
    displayText: getUiTextDisplayText(segments),
    segments,
    style: createUiToneStyle("default", node.textColor),
    textColorClassName: getUiSyntaxTextColorClassName(node.textColor),
  };
}
