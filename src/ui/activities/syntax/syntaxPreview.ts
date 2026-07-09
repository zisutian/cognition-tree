import type { CSSProperties } from "react";
import type {
  UiSyntaxProfileDraftInlineRule,
  UiSyntaxTone,
} from "../../../application/workspace/projection/viewSyntax";

export const maxTabDisplayWidth = 16;

const customTonePattern = /^#[0-9a-fA-F]{6}$/;

export function readTabDisplayWidthInput(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return String(
    Math.min(maxTabDisplayWidth, Math.max(1, Number.parseInt(digits, 10))),
  );
}

function isCustomTone(tone: UiSyntaxTone) {
  return customTonePattern.test(tone);
}

export function getRenderToneClass(tone: UiSyntaxTone) {
  return isCustomTone(tone)
    ? "syntax-render-tone-custom"
    : `syntax-render-tone-${tone}`;
}

export function getRenderTextColorClass(tone: UiSyntaxTone) {
  return isCustomTone(tone)
    ? "syntax-render-text-custom"
    : `syntax-render-text-${tone}`;
}

export function getRenderStyle({
  textColor,
  tone,
}: {
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
}): CSSProperties | undefined {
  const style: Record<string, string> = {};

  if (isCustomTone(tone)) {
    style["--syntax-render-tone-color"] = tone;
  }

  if (isCustomTone(textColor)) {
    style["--syntax-render-text-color"] = textColor;
  }

  return Object.keys(style).length > 0 ? (style as CSSProperties) : undefined;
}

export function getInlinePreviewValue(rule: UiSyntaxProfileDraftInlineRule) {
  return rule.label || "行内规则";
}

export function getInlinePreviewMarker(rule: UiSyntaxProfileDraftInlineRule) {
  return rule.kind === "paired"
    ? `${rule.open || "{"}${rule.close || "}"}`
    : rule.marker || "*";
}
