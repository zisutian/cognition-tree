import type {
  CtnSyntaxDraftInline,
} from "../../../../core/ctn/syntax/draft";

export function getInlinePreviewValue(rule: CtnSyntaxDraftInline) {
  return rule.label || "行内规则";
}

export function getInlinePreviewMarker(rule: CtnSyntaxDraftInline) {
  return rule.kind === "paired"
    ? `${rule.open || "{"}${rule.close || "}"}`
    : rule.marker || "*";
}
