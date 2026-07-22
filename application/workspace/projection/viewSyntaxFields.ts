import type { SyntaxProfileDraft } from "../../../core/ctn/syntax/profileDraft";

export type UiSyntaxFieldId = string;

export const syntaxFieldIds = {
  inlineRuleGroup: "syntax-inline-rule-group",
  markerRuleGroup: "syntax-marker-rule-group",
  profileName: "syntax-profile-name",
  root: "syntax-root",
  tabDisplayWidth: "syntax-tab-display-width",
  titleRule: "syntax-title-rule",
  topLevelUnmarkedRule: "syntax-top-level-unmarked-rule",
} as const satisfies Record<string, UiSyntaxFieldId>;

type SyntaxRuleKind = "inline" | "marker";

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
  label: "名称",
  marker: "符号",
  open: "开始符号",
  role: "类型",
  textColor: "文字色",
  tone: "背景色",
  type: "语义 ID",
};

function createRuleLocation({
  field,
  index,
  kind,
  ruleId,
  ruleLabel,
}: {
  field: string | undefined;
  index: number;
  kind: SyntaxRuleKind;
  ruleId: string | undefined;
  ruleLabel: string | undefined;
}): UiSyntaxDiagnosticLocation {
  const groupLabel = kind === "marker" ? "块规则" : "行内规则";
  const itemLabel = ruleLabel?.trim() || `${groupLabel} ${index + 1}`;
  const targetField = field === "type" ? "row" : field ?? "row";

  return {
    fieldId: ruleId
      ? createSyntaxRuleFieldId(kind, ruleId, targetField)
      : kind === "marker"
        ? syntaxFieldIds.markerRuleGroup
        : syntaxFieldIds.inlineRuleGroup,
    label: field ? `${itemLabel} · ${fieldLabels[field] ?? field}` : itemLabel,
  };
}

export function resolveUiSyntaxDiagnosticLocation(
  draft: SyntaxProfileDraft,
  path: string,
): UiSyntaxDiagnosticLocation {
  const normalizedPath = path.replace(/^\$\./, "");

  if (normalizedPath === "name") {
    return { fieldId: syntaxFieldIds.profileName, label: "语法名称" };
  }

  if (normalizedPath === "tabDisplayWidth") {
    return { fieldId: syntaxFieldIds.tabDisplayWidth, label: "缩进宽度" };
  }

  if (normalizedPath === "markers") {
    return { fieldId: syntaxFieldIds.markerRuleGroup, label: "块规则" };
  }

  if (normalizedPath === "inlineRules.global-reference") {
    const protectedRule = draft.inlineRules.find(
      (rule) => rule.type === "global-reference",
    );

    return {
      fieldId: protectedRule
        ? createSyntaxRuleFieldId("inline", protectedRule.id)
        : syntaxFieldIds.inlineRuleGroup,
      label: "全局概念引用规则",
    };
  }

  const fixedRuleMatch = /^(title|concept|body)(?:\.(.+))?$/.exec(normalizedPath);

  if (fixedRuleMatch) {
    const [, kind, field] = fixedRuleMatch;
    const label = kind === "title"
      ? "首行标题"
      : kind === "concept"
        ? "顶格概念"
        : "顶格正文";

    return {
      fieldId:
        kind === "title"
          ? syntaxFieldIds.titleRule
          : syntaxFieldIds.topLevelUnmarkedRule,
      label: field ? `${label} · ${fieldLabels[field] ?? field}` : label,
    };
  }

  const markerMatch = /^markers\[(\d+)\](?:\.(.+))?$/.exec(normalizedPath);

  if (markerMatch) {
    const index = Number(markerMatch[1]);
    const rule = draft.markerRules[index];

    return createRuleLocation({
      field: markerMatch[2],
      index,
      kind: "marker",
      ruleId: rule?.id,
      ruleLabel: rule?.label,
    });
  }

  const inlineMatch = /^inlineRules\[(\d+)\](?:\.(.+))?$/.exec(
    normalizedPath,
  );

  if (inlineMatch) {
    const index = Number(inlineMatch[1]);
    const rule = draft.inlineRules[index];

    return createRuleLocation({
      field: inlineMatch[2],
      index,
      kind: "inline",
      ruleId: rule?.id,
      ruleLabel: rule?.label,
    });
  }

  return {
    fieldId: syntaxFieldIds.root,
    label: path,
  };
}
