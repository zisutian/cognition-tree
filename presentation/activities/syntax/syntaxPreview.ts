import type {
  AvailableSyntaxViewModel,
} from "../../../application/syntax/index.ts";

type SyntaxInlineRule = AvailableSyntaxViewModel["draft"]["inline"][number];

export function getInlinePreviewValue(rule: SyntaxInlineRule) {
  return rule.label || "行内规则";
}

export function getInlinePreviewMarker(rule: SyntaxInlineRule) {
  return rule.kind === "paired"
    ? `${rule.open || "{"}${rule.close || "}"}`
    : rule.marker || "*";
}
