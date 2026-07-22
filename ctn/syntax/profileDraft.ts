// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnRuleRole,
  CtnSyntaxProfile,
  CtnSyntaxTone,
} from "./types.ts";
import {
  syntaxProfileSchema,
  syntaxProfileValidationPolicies,
  validateSyntaxProfile,
  type CtnSyntaxProfileValidationPolicy,
  type SyntaxProfileSchemaDiagnosticCode,
} from "./profileSchema.ts";

export type SyntaxProfileDraftMarkerRule = {
  id: string;
  label: string;
  marker: string;
  role: CtnRuleRole;
  textColor: CtnSyntaxTone;
  tone: CtnSyntaxTone;
  type: string;
};

export type SyntaxProfileDraftTopLevelUnmarkedRule = {
  id: string;
  label: string;
  textColor: CtnSyntaxTone;
  tone: CtnSyntaxTone;
  type: string;
};

export type SyntaxProfileDraftTitleRule = {
  id: string;
  label: string;
  textColor: CtnSyntaxTone;
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
  textColor: CtnSyntaxTone;
  tone: CtnSyntaxTone;
  type: string;
};

export type SyntaxProfileDraft = {
  inlineRules: SyntaxProfileDraftInlineRule[];
  markerRules: SyntaxProfileDraftMarkerRule[];
  name: string;
  tabDisplayWidth: string;
  titleRule: SyntaxProfileDraftTitleRule;
  topLevelUnmarkedRule: SyntaxProfileDraftTopLevelUnmarkedRule | null;
};

export type SyntaxProfileDraftDiagnostic = {
  code: SyntaxProfileSchemaDiagnosticCode;
  message: string;
  path: string;
};

export type SyntaxProfileDraftBuildResult = {
  diagnostics: SyntaxProfileDraftDiagnostic[];
  profile: CtnSyntaxProfile | null;
};

function createDraftId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

function createGeneratedType(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

function getNextDraftIndex<T extends { id: string }>(
  drafts: T[],
  prefix: string,
) {
  const idPrefix = `${prefix}-`;
  const maxExistingIndex = drafts.reduce((maxIndex, draft) => {
    if (!draft.id.startsWith(idPrefix)) {
      return maxIndex;
    }

    const index = Number(draft.id.slice(idPrefix.length));

    return Number.isInteger(index) && index > maxIndex ? index : maxIndex;
  }, 0);

  return maxExistingIndex;
}

function sortProtectedInlineRuleFirst<T extends { type: string }>(rules: T[]) {
  return [...rules].sort((left, right) => {
    if (left.type === syntaxProfileSchema.requiredTypes.globalReference) {
      return -1;
    }

    if (right.type === syntaxProfileSchema.requiredTypes.globalReference) {
      return 1;
    }

    return 0;
  });
}

export function isProtectedInlineRuleDraft(
  rule: SyntaxProfileDraftInlineRule,
) {
  return rule.type === syntaxProfileSchema.requiredTypes.globalReference;
}

export function createEmptyMarkerRuleDraft(
  index: number,
): SyntaxProfileDraftMarkerRule {
  return {
    id: createDraftId("marker", index),
    label: "",
    marker: "",
    role: "normal",
    textColor: "green",
    tone: "green",
    type: createGeneratedType("marker-rule", index),
  };
}

export function createNextMarkerRuleDraft(
  markerRules: SyntaxProfileDraftMarkerRule[],
): SyntaxProfileDraftMarkerRule {
  return createEmptyMarkerRuleDraft(getNextDraftIndex(markerRules, "marker"));
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
    textColor: "green",
    tone: "green",
    type: createGeneratedType("inline-rule", index),
  };
}

export function createNextInlineRuleDraft(
  inlineRules: SyntaxProfileDraftInlineRule[],
  kind: "paired" | "single" = "paired",
): SyntaxProfileDraftInlineRule {
  return createEmptyInlineRuleDraft(
    getNextDraftIndex(inlineRules, "inline"),
    kind,
  );
}

export function createSyntaxProfileDraft(
  profile: CtnSyntaxProfile,
): SyntaxProfileDraft {
  return {
    titleRule: {
      id: "title-1",
      label: profile.titleRule.label,
      textColor: profile.titleRule.textColor,
      tone: profile.titleRule.tone,
      type: profile.titleRule.type,
    },
    inlineRules: sortProtectedInlineRuleFirst(profile.inlineRules).map(
      (rule, index) => ({
        close: rule.kind === "paired" ? rule.close : "",
        id: createDraftId("inline", index),
        kind: rule.kind,
        label: rule.label,
        marker: rule.kind === "single" ? rule.marker : "",
        open: rule.kind === "paired" ? rule.open : "",
        textColor: rule.textColor,
        tone: rule.tone,
        type: rule.type,
      }),
    ),
    markerRules: profile.markerRules.map((rule, index) => ({
      id: createDraftId("marker", index),
      label: rule.label,
      marker: rule.marker,
      role: rule.role,
      textColor: rule.textColor,
      tone: rule.tone,
      type: rule.type,
    })),
    name: profile.name,
    tabDisplayWidth: String(profile.tabDisplayWidth),
    topLevelUnmarkedRule: profile.topLevelUnmarkedRule
      ? {
          id: "top-level-unmarked-1",
          label: profile.topLevelUnmarkedRule.label,
          textColor: profile.topLevelUnmarkedRule.textColor,
          tone: profile.topLevelUnmarkedRule.tone,
          type: profile.topLevelUnmarkedRule.type,
        }
      : null,
  };
}

export function buildSyntaxProfileDraft(
  draft: SyntaxProfileDraft,
  policy: CtnSyntaxProfileValidationPolicy =
    syntaxProfileValidationPolicies.workspace,
): SyntaxProfileDraftBuildResult {
  const profile: CtnSyntaxProfile = {
    topLevelUnmarkedRule: draft.topLevelUnmarkedRule
      ? {
          label: draft.topLevelUnmarkedRule.label.trim(),
          textColor: draft.topLevelUnmarkedRule.textColor,
          tone: draft.topLevelUnmarkedRule.tone,
          type: draft.topLevelUnmarkedRule.type.trim(),
        }
      : null,
    inlineRules: draft.inlineRules.map((rule) =>
      rule.kind === "paired"
        ? {
            close: rule.close.trim(),
            kind: rule.kind,
            label: rule.label.trim(),
            open: rule.open.trim(),
            textColor: rule.textColor,
            tone: rule.tone,
            type: rule.type.trim(),
          }
        : {
            kind: rule.kind,
            label: rule.label.trim(),
            marker: rule.marker.trim(),
            textColor: rule.textColor,
            tone: rule.tone,
            type: rule.type.trim(),
          },
    ),
    markerRules: draft.markerRules.map((rule) => ({
      label: rule.label.trim(),
      marker: rule.marker.trim(),
      role: rule.role,
      textColor: rule.textColor,
      tone: rule.tone,
      type: rule.type.trim(),
    })),
    name: draft.name.trim(),
    tabDisplayWidth: Number(draft.tabDisplayWidth.trim()),
    titleRule: {
      label: draft.titleRule.label.trim(),
      textColor: draft.titleRule.textColor,
      tone: draft.titleRule.tone,
      type: draft.titleRule.type.trim(),
    },
  };
  const diagnostics = validateSyntaxProfile(
    profile,
    policy,
  ).map((diagnostic) => ({ ...diagnostic }));

  if (diagnostics.length > 0) {
    return {
      diagnostics,
      profile: null,
    };
  }

  return {
    diagnostics: [],
    profile: {
      ...profile,
      inlineRules: sortProtectedInlineRuleFirst(profile.inlineRules),
    },
  };
}
