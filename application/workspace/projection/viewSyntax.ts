import { syntaxProfileSchema } from "../../../core/ctn/syntax/profileSchema";
import type { CtnSyntaxProfileValidationPolicy } from "../../../core/ctn/syntax/profileSchema";
import type { CtnRuleRole } from "../../../core/ctn/syntax/types";
import type { SyntaxProfileDraft } from "../../../core/ctn/syntax/profileDraft";
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

export type UiSyntaxProfileDraftTopLevelUnmarkedRule = {
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
  inlineRules: UiSyntaxProfileDraftInlineRule[];
  markerRules: UiSyntaxProfileDraftMarkerRule[];
  name: string;
  tabDisplayWidth: string;
  titleRule: UiSyntaxProfileDraftTitleRule;
  topLevelUnmarkedRule: UiSyntaxProfileDraftTopLevelUnmarkedRule | null;
};

export type UiSyntaxFocusTarget =
  | {
      fieldId: UiSyntaxFieldId;
      requestId: number;
      syntaxFileId: string;
    }
  | {
      fieldId: UiSyntaxFieldId;
      requestId: number;
      systemOwner: "journal" | "todo";
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
  customToneLabel: string;
  draft: UiSyntaxProfileDraft;
  focusTarget: UiSyntaxFocusTarget | null;
  optionalToneOptions: UiSyntaxToneOption[];
  roleOptions: UiSyntaxRoleOption[];
  rootToneOptions: UiSyntaxToneOption[];
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

const toneLabels: Record<(typeof syntaxProfileSchema.tones)[number], string> = {
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

export const syntaxToneOptions: UiSyntaxToneOption[] =
  syntaxProfileSchema.tones.map((tone) => ({
    label: toneLabels[tone],
    value: tone,
  }));

const optionalSyntaxToneOptions: UiSyntaxToneOption[] = [
  { label: "默认", value: "default" },
  ...syntaxToneOptions,
];

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
    inlineRules: draft.inlineRules.map((rule) => ({ ...rule })),
    markerRules: draft.markerRules.map((rule) => ({ ...rule })),
    name: draft.name,
    tabDisplayWidth: draft.tabDisplayWidth,
    titleRule: { ...draft.titleRule },
    topLevelUnmarkedRule: draft.topLevelUnmarkedRule
      ? { ...draft.topLevelUnmarkedRule }
      : null,
  };
}

export function createUiSyntaxView({
  draft,
  focusTarget = null,
  policy = { scope: "workspace" },
}: {
  draft: SyntaxProfileDraft;
  focusTarget?: UiSyntaxFocusTarget | null;
  policy?: CtnSyntaxProfileValidationPolicy;
}): UiSyntaxView {
  return {
    constraints: syntaxConstraints,
    customToneLabel: "自定义",
    draft: createUiSyntaxProfileDraft(draft),
    focusTarget,
    optionalToneOptions: optionalSyntaxToneOptions,
    roleOptions: syntaxRoleOptions,
    rootToneOptions: policy.scope === "journal"
      ? optionalSyntaxToneOptions
      : syntaxToneOptions,
    stats: {
      inlineRuleCount: draft.inlineRules.length,
      lineRuleCount:
        draft.markerRules.length + 1 + (draft.topLevelUnmarkedRule ? 1 : 0),
    },
    toneOptions: syntaxToneOptions,
  };
}
