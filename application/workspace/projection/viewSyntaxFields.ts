import type {
  CtnSyntaxDraft,
} from "../../../core/ctn/syntax/draft";

export type UiSyntaxFieldId = string;

export const syntaxFieldIds = {
  blockRuleGroup: "syntax-block-rule-group",
  inlineRuleGroup: "syntax-inline-rule-group",
  name: "syntax-name",
  root: "syntax-root-rule",
  tabDisplayWidth: "syntax-tab-display-width",
  title: "syntax-title-rule",
  viewRoot: "syntax-view-root",
} as const satisfies Record<string, UiSyntaxFieldId>;

type SyntaxRuleKind = "block" | "inline";

export function createSyntaxRuleFieldId(
  kind: SyntaxRuleKind,
  ruleId: string,
  field = "row",
): UiSyntaxFieldId {
  return `syntax-${kind}-${ruleId}-${field}`;
}

export type UiSyntaxDiagnosticLocation = {
  fieldId: UiSyntaxFieldId;
  label: string;
};

const fieldLabels: Record<string, string> = {
  close: "结束符号",
  kind: "类型",
  label: "名称",
  marker: "符号",
  open: "开始符号",
  semanticId: "语义 ID",
  textColor: "文字色",
  tone: "背景色",
};

function ruleLocation({
  field,
  index,
  kind,
  ruleId,
  ruleLabel,
  fixedTodoItem = false,
}: {
  field: string | undefined;
  index: number;
  kind: SyntaxRuleKind;
  ruleId: string | undefined;
  ruleLabel: string | undefined;
  fixedTodoItem?: boolean;
}): UiSyntaxDiagnosticLocation {
  const groupLabel = kind === "block" ? "块规则" : "行内规则";
  const itemLabel = ruleLabel?.trim() || `${groupLabel} ${index + 1}`;
  const isFixedTodoField = fixedTodoItem &&
    (field === "kind" || field === "label" || field === "marker");
  const targetField = field === "semanticId" || isFixedTodoField
    ? "row"
    : kind === "inline" && field === "textColor"
      ? "tone"
      : field ?? "row";
  const isUnifiedColor = (
    kind === "inline" &&
    (field === "tone" || field === "textColor")
  ) || (fixedTodoItem && field === "textColor");
  const fieldLabel = isUnifiedColor
    ? "颜色"
    : field
      ? fieldLabels[field] ?? field
      : "";

  return {
    fieldId: ruleId
      ? createSyntaxRuleFieldId(kind, ruleId, targetField)
      : kind === "block"
        ? syntaxFieldIds.blockRuleGroup
        : syntaxFieldIds.inlineRuleGroup,
    label: field ? `${itemLabel} · ${fieldLabel}` : itemLabel,
  };
}

export function resolveUiSyntaxDiagnosticLocation(
  draft: CtnSyntaxDraft,
  path: string,
): UiSyntaxDiagnosticLocation {
  const normalized = path.replace(/^\$\./, "");

  if (normalized === "name") {
    return { fieldId: syntaxFieldIds.name, label: "语法名称" };
  }
  if (normalized === "tabDisplayWidth") {
    return { fieldId: syntaxFieldIds.tabDisplayWidth, label: "缩进宽度" };
  }
  if (normalized === "blocks" || normalized === "blocks.todo-item") {
    return { fieldId: syntaxFieldIds.blockRuleGroup, label: "块规则" };
  }
  if (normalized === "inline.global-reference") {
    const rule = draft.inline.find(
      ({ semanticId }) => semanticId === "global-reference",
    );

    return {
      fieldId: rule
        ? createSyntaxRuleFieldId("inline", rule.id)
        : syntaxFieldIds.inlineRuleGroup,
      label: "全局概念引用规则",
    };
  }
  const displayMatch = /^(title|root)(?:\.(.+))?$/.exec(normalized);

  if (displayMatch) {
    const [, kind, field] = displayMatch;
    const label = kind === "title" ? "首行标题" : "顶格规则";

    return {
      fieldId: kind === "title" ? syntaxFieldIds.title : syntaxFieldIds.root,
      label: field ? `${label} · ${fieldLabels[field] ?? field}` : label,
    };
  }
  const blockMatch = /^blocks\[(\d+)\](?:\.(.+))?$/.exec(normalized);

  if (blockMatch) {
    const index = Number(blockMatch[1]);
    const rule = draft.blocks[index];

    return ruleLocation({
      field: blockMatch[2],
      index,
      kind: "block",
      ruleId: rule?.id,
      ruleLabel: rule?.label,
      fixedTodoItem: rule?.semanticId === "todo-item",
    });
  }
  const inlineMatch = /^inline\[(\d+)\](?:\.(.+))?$/.exec(normalized);

  if (inlineMatch) {
    const index = Number(inlineMatch[1]);
    const rule = draft.inline[index];

    return ruleLocation({
      field: inlineMatch[2],
      index,
      kind: "inline",
      ruleId: rule?.id,
      ruleLabel: rule?.label,
    });
  }
  return { fieldId: syntaxFieldIds.viewRoot, label: path };
}
