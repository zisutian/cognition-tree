import { configurableSyntaxTones } from "../../../ctn/syntax/tones";
import type {
  CtnRuleRole,
  CtnSyntaxProfile,
} from "../../../ctn/syntax/types";
import type {
  SyntaxProfileDraft,
  SyntaxProfileDraftBuildResult,
} from "../../../ctn/syntax/profileDraft";
import type { UiSyntaxTone } from "./viewText";

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
};

export type UiSyntaxProfileMarkerRuleSummary = Omit<
  UiSyntaxProfileDraftMarkerRule,
  "id"
>;

export type UiSyntaxProfileConceptRuleSummary = Omit<
  UiSyntaxProfileDraftConceptRule,
  "id"
>;

export type UiSyntaxProfileInlineRuleSummary = Omit<
  UiSyntaxProfileDraftInlineRule,
  "id"
>;

export type UiSyntaxProfileSummary = {
  conceptRule: UiSyntaxProfileConceptRuleSummary;
  inlineRules: UiSyntaxProfileInlineRuleSummary[];
  markerRules: UiSyntaxProfileMarkerRuleSummary[];
  name: string;
  tabDisplayWidth: number;
};

export type UiSyntaxProfileDiagnostic = {
  message: string;
  path: string;
};

export type UiSyntaxProfileDraftBuildResult = {
  diagnostics: UiSyntaxProfileDiagnostic[];
  profile: UiSyntaxProfileSummary | null;
};

export type UiSyntaxView = {
  draft: UiSyntaxProfileDraft;
  draftResult: UiSyntaxProfileDraftBuildResult;
  feedback: {
    message: string;
    status: "error" | "success";
  } | null;
  roleOptions: UiSyntaxRoleOption[];
  stats: {
    inlineRuleCount: number;
    markerRuleCount: number;
  };
  toneOptions: UiSyntaxToneOption[];
};

const roleLabels: Record<CtnRuleRole, string> = {
  multiline: "多行块",
  normal: "普通块",
};

const syntaxRoleOptions: UiSyntaxRoleOption[] = [
  { label: roleLabels.normal, value: "normal" },
  { label: roleLabels.multiline, value: "multiline" },
];

export const syntaxToneOptions: UiSyntaxToneOption[] =
  configurableSyntaxTones.map((tone) => ({
    label: tone,
    value: tone,
  }));

function createUiSyntaxProfileDraft(
  draft: SyntaxProfileDraft,
): UiSyntaxProfileDraft {
  return {
    conceptRule: { ...draft.conceptRule },
    inlineRules: draft.inlineRules.map((rule) => ({ ...rule })),
    markerRules: draft.markerRules.map((rule) => ({ ...rule })),
    name: draft.name,
    tabDisplayWidth: draft.tabDisplayWidth,
  };
}

function createUiSyntaxProfileInlineRuleSummary(
  rule: CtnSyntaxProfile["inlineRules"][number],
): UiSyntaxProfileInlineRuleSummary {
  return {
    close: rule.kind === "paired" ? rule.close : "",
    kind: rule.kind,
    label: rule.label,
    marker: rule.kind === "single" ? rule.marker : "",
    open: rule.kind === "paired" ? rule.open : "",
    textColor: rule.textColor,
    tone: rule.tone,
    type: rule.type,
  };
}

function createUiSyntaxProfileSummary(
  profile: CtnSyntaxProfile | null,
): UiSyntaxProfileSummary | null {
  return profile
    ? {
        conceptRule: { ...profile.conceptRule },
        inlineRules: profile.inlineRules.map(createUiSyntaxProfileInlineRuleSummary),
        markerRules: profile.markerRules.map((rule) => ({ ...rule })),
        name: profile.name,
        tabDisplayWidth: profile.tabDisplayWidth,
      }
    : null;
}

function createUiSyntaxProfileDraftBuildResult(
  draftResult: SyntaxProfileDraftBuildResult,
): UiSyntaxProfileDraftBuildResult {
  return {
    diagnostics: draftResult.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    profile: createUiSyntaxProfileSummary(draftResult.profile),
  };
}

export function createUiSyntaxView({
  draft,
  draftResult,
  feedback,
}: {
  draft: SyntaxProfileDraft;
  draftResult: SyntaxProfileDraftBuildResult;
  feedback: UiSyntaxView["feedback"];
}): UiSyntaxView {
  return {
    draft: createUiSyntaxProfileDraft(draft),
    draftResult: createUiSyntaxProfileDraftBuildResult(draftResult),
    feedback,
    roleOptions: syntaxRoleOptions,
    stats: {
      inlineRuleCount: draft.inlineRules.length,
      markerRuleCount: draft.markerRules.length + 1,
    },
    toneOptions: syntaxToneOptions,
  };
}
