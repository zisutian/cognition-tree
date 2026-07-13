import type { UiSyntaxProfileDraftInlineRule } from "../../../application/workspace/projection/viewSyntax";

export function getInlinePreviewValue(rule: UiSyntaxProfileDraftInlineRule) {
  return rule.label || "行内规则";
}

export function getInlinePreviewMarker(rule: UiSyntaxProfileDraftInlineRule) {
  return rule.kind === "paired"
    ? `${rule.open || "{"}${rule.close || "}"}`
    : rule.marker || "*";
}
