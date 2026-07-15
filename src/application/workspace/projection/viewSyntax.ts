import { syntaxProfileSchema } from "../../../ctn/syntax/profileSchema";
import type { CtnRuleRole } from "../../../ctn/syntax/types";
import type { SyntaxProfileDraft } from "../../../ctn/syntax/profileDraft";
import type { UiSyntaxTone } from "./viewText";
import type { UiSyntaxFieldId } from "./viewSyntaxFields";

export type { UiSyntaxTone } from "./viewText";

export type UiSyntaxRole = "normal" | "multiline";

export type UiSyntaxToneOption = {
  label: string;
  value: UiSyntaxTone;
};

export type UiSyntaxRoleOption = {
  label: string;
  value: UiSyntaxRole;
};

export type UiSyntaxProfileDraftMarkerRule = {
  id: string;
  label: string;
  marker: string;
  role: UiSyntaxRole;
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
  type: string;
};

export type UiSyntaxProfileDraftConceptRule = {
  id: string;
  label: string;
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
  type: string;
};

export type UiSyntaxProfileDraftTitleRule = {
  id: string;
  label: string;
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
  type: string;
};

export type UiSyntaxProfileDraftInlineRule = {
  close: string;
  id: string;
  kind: "paired" | "single";
  label: string;
  marker: string;
  open: string;
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
  type: string;
};

export type UiSyntaxProfileDraft = {
  conceptRule: UiSyntaxProfileDraftConceptRule;
  inlineRules: UiSyntaxProfileDraftInlineRule[];
  markerRules: UiSyntaxProfileDraftMarkerRule[];
  name: string;
  tabDisplayWidth: string;
  titleRule: UiSyntaxProfileDraftTitleRule;
};

export type UiSyntaxFocusTarget = {
  fieldId: UiSyntaxFieldId;
  requestId: number;
};

export type UiSyntaxConstraints = {
  label: {
    maxLength: number;
  };
  profileName: {
    maxLength: number;
  };
  tabDisplayWidth: {
    max: number;
    min: number;
  };
  token: {
    maxLength: number;
  };
};

export type UiSyntaxView = {
  constraints: UiSyntaxConstraints;
  draft: UiSyntaxProfileDraft;
  focusTarget: UiSyntaxFocusTarget | null;
  roleOptions: UiSyntaxRoleOption[];
  stats: {
    inlineRuleCount: number;
    lineRuleCount: number;
  };
  toneOptions: UiSyntaxToneOption[];
};

const roleLabels: Record<CtnRuleRole, string> = {
  multiline: "多行块",
  normal: "普通块",
};

const syntaxRoleOptions: UiSyntaxRoleOption[] = syntaxProfileSchema.roles.map(
  (value) => ({ label: roleLabels[value], value }),
);

export const syntaxToneOptions: UiSyntaxToneOption[] =
  syntaxProfileSchema.tones.map((tone) => ({
    label: tone,
    value: tone,
  }));

const syntaxConstraints: UiSyntaxConstraints = {
  label: {
    maxLength: syntaxProfileSchema.label.maxLength,
  },
  profileName: {
    maxLength: syntaxProfileSchema.profileName.maxLength,
  },
  tabDisplayWidth: {
    max: syntaxProfileSchema.tabDisplayWidth.max,
    min: syntaxProfileSchema.tabDisplayWidth.min,
  },
  token: {
    maxLength: syntaxProfileSchema.token.maxLength,
  },
};

function createUiSyntaxProfileDraft(
  draft: SyntaxProfileDraft,
): UiSyntaxProfileDraft {
  return {
    conceptRule: { ...draft.conceptRule },
    inlineRules: draft.inlineRules.map((rule) => ({ ...rule })),
    markerRules: draft.markerRules.map((rule) => ({ ...rule })),
    name: draft.name,
    tabDisplayWidth: draft.tabDisplayWidth,
    titleRule: { ...draft.titleRule },
  };
}

export function createUiSyntaxView({
  draft,
  focusTarget = null,
}: {
  draft: SyntaxProfileDraft;
  focusTarget?: UiSyntaxFocusTarget | null;
}): UiSyntaxView {
  return {
    constraints: syntaxConstraints,
    draft: createUiSyntaxProfileDraft(draft),
    focusTarget,
    roleOptions: syntaxRoleOptions,
    stats: {
      inlineRuleCount: draft.inlineRules.length,
      lineRuleCount: draft.markerRules.length + 2,
    },
    toneOptions: syntaxToneOptions,
  };
}
