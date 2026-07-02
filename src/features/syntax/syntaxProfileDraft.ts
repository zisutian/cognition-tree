import type {
  CtnConceptRule,
  CtnInlineRule,
  CtnMarkerRule,
  CtnPresetSyntaxTone,
  CtnRuleRole,
  CtnSyntaxProfile,
  CtnSyntaxTone,
} from "../../syntax/types";
import {
  configurableSyntaxTones,
  isConfigurableSyntaxTone,
} from "../../syntax/tones";

export type SyntaxProfileDraftMarkerRule = {
  id: string;
  label: string;
  marker: string;
  role: CtnRuleRole;
  tone: CtnSyntaxTone;
  type: string;
};

export type SyntaxProfileDraftConceptRule = {
  id: string;
  label: string;
  tone: CtnSyntaxTone;
  type: string;
};

export type SyntaxProfileDraftInlineRule = {
  close: string;
  id: string;
  kind: "paired" | "single";
  label: string;
  marker: string;
  open: string;
  tone: CtnSyntaxTone;
  type: string;
};

export type SyntaxProfileDraft = {
  conceptRule: SyntaxProfileDraftConceptRule;
  inlineRules: SyntaxProfileDraftInlineRule[];
  markerRules: SyntaxProfileDraftMarkerRule[];
  name: string;
  tabDisplayWidth: string;
};

export type SyntaxProfileDraftDiagnostic = {
  message: string;
  path: string;
};

export type SyntaxProfileDraftBuildResult = {
  diagnostics: SyntaxProfileDraftDiagnostic[];
  profile: CtnSyntaxProfile | null;
};

export const syntaxRuleRoles: CtnRuleRole[] = ["normal", "multiline"];

export const syntaxTones: CtnPresetSyntaxTone[] = configurableSyntaxTones;

const requiredGlobalReferenceType = "global-reference";
const requiredTopLevelConceptType = "concept";
const semanticIdPattern = /^[a-z][a-z0-9-]*$/;

function createDraftId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

function createGeneratedType(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

function sortProtectedInlineRuleFirst<T extends { type: string }>(rules: T[]) {
  return [...rules].sort((left, right) => {
    if (left.type === requiredGlobalReferenceType) {
      return -1;
    }

    if (right.type === requiredGlobalReferenceType) {
      return 1;
    }

    return 0;
  });
}

function readRequiredText(
  value: string,
  path: string,
  label: string,
  diagnostics: SyntaxProfileDraftDiagnostic[],
) {
  const trimmed = value.trim();

  if (!trimmed) {
    diagnostics.push({
      message: `${label}不能为空。`,
      path,
    });
  }

  return trimmed;
}

function readPositiveInteger(
  value: string,
  path: string,
  label: string,
  diagnostics: SyntaxProfileDraftDiagnostic[],
) {
  const trimmed = value.trim();
  const numericValue = Number(trimmed);

  if (!trimmed || !Number.isInteger(numericValue) || numericValue < 1) {
    diagnostics.push({
      message: `${label}必须是正整数。`,
      path,
    });
    return null;
  }

  return numericValue;
}

function validateSemanticId(
  value: string,
  path: string,
  label: string,
  diagnostics: SyntaxProfileDraftDiagnostic[],
) {
  if (value && !semanticIdPattern.test(value)) {
    diagnostics.push({
      message: `${label}必须是 ASCII kebab-case，例如 definition 或 claim-source。`,
      path,
    });
  }
}

function validateTone(
  value: string,
  path: string,
  diagnostics: SyntaxProfileDraftDiagnostic[],
) {
  if (!isConfigurableSyntaxTone(value)) {
    diagnostics.push({
      message: "颜色必须是预设颜色或 #RRGGBB。",
      path,
    });
  }
}

export function isProtectedInlineRuleDraft(
  rule: SyntaxProfileDraftInlineRule,
) {
  return rule.type === requiredGlobalReferenceType;
}

export function createEmptyMarkerRuleDraft(
  index: number,
): SyntaxProfileDraftMarkerRule {
  return {
    id: createDraftId("marker", index),
    label: "",
    marker: "",
    role: "normal",
    tone: "green",
    type: createGeneratedType("marker-rule", index),
  };
}

export function createEmptyInlineRuleDraft(
  index: number,
  kind: "paired" | "single" = "paired",
): SyntaxProfileDraftInlineRule {
  return {
    close: "",
    id: createDraftId("inline", index),
    kind,
    label: "",
    marker: "",
    open: "",
    tone: "green",
    type: createGeneratedType("inline-rule", index),
  };
}

export function createSyntaxProfileDraft(
  profile: CtnSyntaxProfile,
): SyntaxProfileDraft {
  return {
    conceptRule: {
      id: "concept-1",
      label: profile.conceptRule.label,
      tone: profile.conceptRule.tone,
      type: profile.conceptRule.type,
    },
    inlineRules: sortProtectedInlineRuleFirst(profile.inlineRules).map(
      (rule, index) => ({
        close: rule.kind === "paired" ? rule.close : "",
        id: createDraftId("inline", index),
        kind: rule.kind,
        label: rule.label,
        marker: rule.kind === "single" ? rule.marker : "",
        open: rule.kind === "paired" ? rule.open : "",
        tone: rule.tone,
        type: rule.type,
      }),
    ),
    markerRules: profile.markerRules.map((rule, index) => ({
      id: createDraftId("marker", index),
      label: rule.label,
      marker: rule.marker,
      role: rule.role,
      tone: rule.tone,
      type: rule.type,
    })),
    name: profile.name,
    tabDisplayWidth: String(profile.tabDisplayWidth),
  };
}

export function buildSyntaxProfileDraft(
  draft: SyntaxProfileDraft,
): SyntaxProfileDraftBuildResult {
  const diagnostics: SyntaxProfileDraftDiagnostic[] = [];
  const name = readRequiredText(draft.name, "$.name", "语法名称", diagnostics);
  const tabDisplayWidth = readPositiveInteger(
    draft.tabDisplayWidth,
    "$.tabDisplayWidth",
    "Tab 显示宽度",
    diagnostics,
  );
  const markerSet = new Set<string>();
  let conceptRule: CtnConceptRule | null = null;
  const markerRules: CtnMarkerRule[] = [];
  const inlineRules: CtnInlineRule[] = [];

  const conceptLabel = readRequiredText(
    draft.conceptRule.label,
    "concept.label",
    "顶格概念名称",
    diagnostics,
  );
  const conceptType = readRequiredText(
    draft.conceptRule.type,
    "concept.type",
    "顶格概念语义 ID",
    diagnostics,
  );

  validateSemanticId(conceptType, "concept.type", "顶格概念语义 ID", diagnostics);
  validateTone(draft.conceptRule.tone, "concept.tone", diagnostics);

  if (conceptType !== requiredTopLevelConceptType) {
    diagnostics.push({
      message: "顶格概念规则不能改为其他语义 ID。",
      path: "concept.type",
    });
  }

  if (
    conceptLabel &&
    conceptType === requiredTopLevelConceptType &&
    isConfigurableSyntaxTone(draft.conceptRule.tone)
  ) {
    conceptRule = {
      label: conceptLabel,
      tone: draft.conceptRule.tone,
      type: conceptType,
    };
  }

  draft.markerRules.forEach((rule, index) => {
    const path = `markers[${index}]`;
    const marker = readRequiredText(
      rule.marker,
      `${path}.marker`,
      "行首符号",
      diagnostics,
    );
    const type = readRequiredText(
      rule.type,
      `${path}.type`,
      "行首语义 ID",
      diagnostics,
    );
    const label = readRequiredText(
      rule.label,
      `${path}.label`,
      "行首名称",
      diagnostics,
    );

    validateSemanticId(type, `${path}.type`, "行首语义 ID", diagnostics);
    validateTone(rule.tone, `${path}.tone`, diagnostics);

    if (marker && markerSet.has(marker)) {
      diagnostics.push({
        message: `行首符号 ${marker} 重复。`,
        path: `${path}.marker`,
      });
    }

    if (
      !marker ||
      !type ||
      !label ||
      !semanticIdPattern.test(type) ||
      !isConfigurableSyntaxTone(rule.tone)
    ) {
      return;
    }

    markerSet.add(marker);
    markerRules.push({
      label,
      marker,
      role: rule.role,
      tone: rule.tone,
      type,
    });
  });

  if (markerRules.length === 0) {
    diagnostics.push({
      message: "至少需要一个行首规则。",
      path: "markers",
    });
  }

  draft.inlineRules.forEach((rule, index) => {
    const path = `inlineRules[${index}]`;
    const type = readRequiredText(
      rule.type,
      `${path}.type`,
      "行内语义 ID",
      diagnostics,
    );
    const label = readRequiredText(
      rule.label,
      `${path}.label`,
      "行内名称",
      diagnostics,
    );

    validateSemanticId(type, `${path}.type`, "行内语义 ID", diagnostics);
    validateTone(rule.tone, `${path}.tone`, diagnostics);

    if (
      !type ||
      !label ||
      !semanticIdPattern.test(type) ||
      !isConfigurableSyntaxTone(rule.tone)
    ) {
      return;
    }

    if (rule.kind === "paired") {
      const open = readRequiredText(
        rule.open,
        `${path}.open`,
        "开始符号",
        diagnostics,
      );
      const close = readRequiredText(
        rule.close,
        `${path}.close`,
        "结束符号",
        diagnostics,
      );

      if (!open || !close) {
        return;
      }

      inlineRules.push({
        close,
        kind: "paired",
        label,
        open,
        tone: rule.tone,
        type,
      });
      return;
    }

    const marker = readRequiredText(
      rule.marker,
      `${path}.marker`,
      "行内符号",
      diagnostics,
    );

    if (!marker) {
      return;
    }

    inlineRules.push({
      kind: "single",
      label,
      marker,
      tone: rule.tone,
      type,
    });
  });

  if (
    !inlineRules.some(
      (rule) =>
        rule.kind === "paired" && rule.type === requiredGlobalReferenceType,
    )
  ) {
    diagnostics.push({
      message: "全局概念引用规则不能删除，且必须是成对行内规则。",
      path: "inlineRules.global-reference",
    });
  }

  if (
    diagnostics.length > 0 ||
    !name ||
    !tabDisplayWidth ||
    !conceptRule ||
    markerRules.length === 0
  ) {
    return {
      diagnostics,
      profile: null,
    };
  }

  return {
    diagnostics: [],
    profile: {
      conceptRule,
      inlineRules: sortProtectedInlineRuleFirst(inlineRules),
      markerRules,
      name,
      tabDisplayWidth,
    },
  };
}
