// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnSyntaxDraft,
} from "../../core/ctn/syntax/draft";
import {
  ctnSyntaxSchema,
} from "../../core/ctn/syntax/schema";
import type {
  CtnBlockKind,
  CtnSyntaxOwner,
  CtnSyntaxTone,
} from "../../core/ctn/syntax/types";

export type SyntaxTone = CtnSyntaxTone;

export type SyntaxToneOption = {
  label: string;
  value: SyntaxTone;
};

export type SyntaxKindOption = {
  label: string;
  value: CtnBlockKind;
};

export type SyntaxFieldId = string;

export type SyntaxFocusTarget =
  | {
      fieldId: SyntaxFieldId;
      requestId: number;
      syntaxFileId: string;
    }
  | {
      fieldId: SyntaxFieldId;
      requestId: number;
      systemOwner: "journal" | "todo";
    };

export type SyntaxConstraints = {
  label: {
    maxLength: number;
  };
  name: {
    maxLength: number;
  };
  tabDisplayWidth: {
    max: number;
    min: number;
  };
  token: {
    maxCodePoints: number;
  };
};

export type SyntaxProjection = {
  backgroundToneOptions: SyntaxToneOption[];
  constraints: SyntaxConstraints;
  customToneLabel: string;
  draft: CtnSyntaxDraft | null;
  focusTarget: SyntaxFocusTarget | null;
  kindOptions: SyntaxKindOption[];
  owner: CtnSyntaxOwner;
  rootRuleLabel: string | null;
  rootTextColorOptions: SyntaxToneOption[];
  stats: {
    blockRuleCount: number;
    inlineRuleCount: number;
  };
  toneOptions: SyntaxToneOption[];
};

export const syntaxFieldIds = {
  blockRuleGroup: "syntax-block-rule-group",
  inlineRuleGroup: "syntax-inline-rule-group",
  name: "syntax-name",
  root: "syntax-root-rule",
  tabDisplayWidth: "syntax-tab-display-width",
  title: "syntax-title-rule",
  viewRoot: "syntax-view-root",
} as const satisfies Record<string, SyntaxFieldId>;

type SyntaxRuleKind = "block" | "inline";

export function createSyntaxRuleFieldId(
  kind: SyntaxRuleKind,
  ruleId: string,
  field = "row",
): SyntaxFieldId {
  return `syntax-${kind}-${ruleId}-${field}`;
}

const kindLabels: Record<CtnBlockKind, string> = {
  line: "普通块",
  multiline: "多行块",
};

const syntaxKindOptions: SyntaxKindOption[] =
  ctnSyntaxSchema.blockKinds.map((value) => ({
    label: kindLabels[value],
    value,
  }));

const toneLabels: Record<(typeof ctnSyntaxSchema.tones)[number], string> = {
  amber: "琥珀",
  blue: "蓝色",
  cyan: "青色",
  gray: "灰色",
  green: "绿色",
  indigo: "靛蓝",
  pink: "粉色",
  red: "红色",
  teal: "青绿",
  violet: "紫色",
};

export const syntaxToneOptions: SyntaxToneOption[] =
  ctnSyntaxSchema.tones.map((tone) => ({
    label: toneLabels[tone],
    value: tone,
  }));

const backgroundSyntaxToneOptions: SyntaxToneOption[] = [
  { label: "编辑器背景", value: "default" },
  ...syntaxToneOptions,
];

const defaultTextColorOptions: SyntaxToneOption[] = [
  { label: "编辑器文字", value: "default" },
  ...syntaxToneOptions,
];

const syntaxConstraints: SyntaxConstraints = {
  label: {
    maxLength: ctnSyntaxSchema.label.maxLength,
  },
  name: {
    maxLength: ctnSyntaxSchema.name.maxLength,
  },
  tabDisplayWidth: {
    max: ctnSyntaxSchema.tabDisplayWidth.max,
    min: ctnSyntaxSchema.tabDisplayWidth.min,
  },
  token: {
    maxCodePoints: ctnSyntaxSchema.token.maxCodePoints,
  },
};

export function createSyntaxProjection<Draft extends CtnSyntaxDraft | null>({
  draft,
  focusTarget = null,
  owner = "workspace",
}: {
  draft: Draft;
  focusTarget?: SyntaxFocusTarget | null;
  owner?: CtnSyntaxOwner;
}): Omit<SyntaxProjection, "draft"> & { draft: Draft } {
  const rootSemanticId = ctnSyntaxSchema.owners[owner].root.semanticId;

  return {
    backgroundToneOptions: backgroundSyntaxToneOptions,
    constraints: syntaxConstraints,
    customToneLabel: "自定义",
    draft,
    focusTarget,
    kindOptions: syntaxKindOptions,
    owner,
    rootRuleLabel: rootSemanticId === "concept"
      ? "顶格概念"
      : rootSemanticId === "body"
        ? "顶格正文"
        : null,
    rootTextColorOptions: owner === "journal"
      ? defaultTextColorOptions
      : syntaxToneOptions,
    stats: {
      blockRuleCount: draft?.blocks.length ?? 0,
      inlineRuleCount: draft?.inline.length ?? 0,
    },
    toneOptions: syntaxToneOptions,
  };
}

export type SyntaxDiagnosticLocation = {
  fieldId: SyntaxFieldId;
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
}): SyntaxDiagnosticLocation {
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

export function resolveSyntaxDiagnosticLocation(
  draft: CtnSyntaxDraft,
  path: string,
): SyntaxDiagnosticLocation {
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
