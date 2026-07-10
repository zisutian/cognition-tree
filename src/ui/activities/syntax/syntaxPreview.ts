import type {
  UiSyntaxProfileDraftInlineRule,
} from "../../../application/workspace/projection/viewSyntax";

export const maxTabDisplayWidth = 16;

export function readTabDisplayWidthInput(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return String(
    Math.min(maxTabDisplayWidth, Math.max(1, Number.parseInt(digits, 10))),
  );
}

export function getInlinePreviewValue(rule: UiSyntaxProfileDraftInlineRule) {
  return rule.label || "行内规则";
}

export function getInlinePreviewMarker(rule: UiSyntaxProfileDraftInlineRule) {
  return rule.kind === "paired"
    ? `${rule.open || "{"}${rule.close || "}"}`
    : rule.marker || "*";
}
