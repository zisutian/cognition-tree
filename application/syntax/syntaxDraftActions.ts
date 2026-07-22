import {
  createNextInlineRuleDraft,
  createNextMarkerRuleDraft,
  isProtectedInlineRuleDraft,
  type SyntaxProfileDraft,
  type SyntaxProfileDraftInlineRule,
  type SyntaxProfileDraftMarkerRule,
  type SyntaxProfileDraftTitleRule,
  type SyntaxProfileDraftTopLevelUnmarkedRule,
} from "../../core/ctn/syntax/profileDraft";
import { normalizeSyntaxTabDisplayWidthInput } from "../../core/ctn/syntax/profileSchema";
import type {
  UiSyntaxProfileDraftInlineRule,
  UiSyntaxProfileDraftMarkerRule,
  UiSyntaxProfileDraftTitleRule,
  UiSyntaxProfileDraftTopLevelUnmarkedRule,
} from "../workspace/projection/viewSyntax";

export function createSyntaxDraftActions({
  nameEditable = true,
  protectedInlineTriggerRuleIds = [],
  protectedMarkerRuleIds = [],
  syntaxDraft,
  updateSyntaxDraft,
}: {
  nameEditable?: boolean;
  protectedInlineTriggerRuleIds?: string[];
  protectedMarkerRuleIds?: string[];
  syntaxDraft: SyntaxProfileDraft;
  updateSyntaxDraft: (draft: SyntaxProfileDraft) => void;
}) {
  const updateSyntaxName = (name: string) => {
    if (!nameEditable) {
      return;
    }
    updateSyntaxDraft({
      ...syntaxDraft,
      name,
    });
  };
  const updateSyntaxTabDisplayWidth = (value: string) => {
    updateSyntaxDraft({
      ...syntaxDraft,
      tabDisplayWidth: normalizeSyntaxTabDisplayWidthInput(value),
    });
  };
  const updateSyntaxMarkerRule = (
    ruleId: string,
    patch: Partial<UiSyntaxProfileDraftMarkerRule>,
  ) => {
    const protectedRole = protectedMarkerRuleIds.includes(ruleId);

    updateSyntaxDraft({
      ...syntaxDraft,
      markerRules: syntaxDraft.markerRules.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              ...(patch as Partial<SyntaxProfileDraftMarkerRule>),
              role: protectedRole ? rule.role : patch.role ?? rule.role,
              type: protectedRole ? rule.type : patch.type ?? rule.type,
            }
          : rule,
      ),
    });
  };
  const updateSyntaxTopLevelUnmarkedRule = (
    patch: Partial<UiSyntaxProfileDraftTopLevelUnmarkedRule>,
  ) => {
    if (!syntaxDraft.topLevelUnmarkedRule) {
      return;
    }
    updateSyntaxDraft({
      ...syntaxDraft,
      topLevelUnmarkedRule: {
        ...syntaxDraft.topLevelUnmarkedRule,
        ...(patch as Partial<SyntaxProfileDraftTopLevelUnmarkedRule>),
      },
    });
  };
  const updateSyntaxTitleRule = (
    patch: Partial<UiSyntaxProfileDraftTitleRule>,
  ) => {
    updateSyntaxDraft({
      ...syntaxDraft,
      titleRule: {
        ...syntaxDraft.titleRule,
        ...(patch as Partial<SyntaxProfileDraftTitleRule>),
      },
    });
  };
  const updateSyntaxInlineRule = (
    ruleId: string,
    patch: Partial<UiSyntaxProfileDraftInlineRule>,
  ) => {
    const protectedTrigger = protectedInlineTriggerRuleIds.includes(ruleId);

    updateSyntaxDraft({
      ...syntaxDraft,
      inlineRules: syntaxDraft.inlineRules.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              ...(patch as Partial<SyntaxProfileDraftInlineRule>),
              ...(protectedTrigger
                ? {
                    close: rule.close,
                    kind: rule.kind,
                    marker: rule.marker,
                    open: rule.open,
                  }
                : {}),
              type: protectedTrigger || isProtectedInlineRuleDraft(rule)
                ? rule.type
                : patch.type ?? rule.type,
            }
          : rule,
      ),
    });
  };
  const addSyntaxMarkerRule = () => {
    updateSyntaxDraft({
      ...syntaxDraft,
      markerRules: [
        ...syntaxDraft.markerRules,
        createNextMarkerRuleDraft(syntaxDraft.markerRules),
      ],
    });
  };
  const removeSyntaxMarkerRule = (ruleId: string) => {
    if (protectedMarkerRuleIds.includes(ruleId)) {
      return;
    }
    updateSyntaxDraft({
      ...syntaxDraft,
      markerRules: syntaxDraft.markerRules.filter((rule) => rule.id !== ruleId),
    });
  };
  const addSyntaxInlineRule = (kind: "paired" | "single") => {
    updateSyntaxDraft({
      ...syntaxDraft,
      inlineRules: [
        ...syntaxDraft.inlineRules,
        createNextInlineRuleDraft(syntaxDraft.inlineRules, kind),
      ],
    });
  };
  const removeSyntaxInlineRule = (ruleId: string) => {
    const rule = syntaxDraft.inlineRules.find(({ id }) => id === ruleId);

    if (rule && isProtectedInlineRuleDraft(rule)) {
      return;
    }
    updateSyntaxDraft({
      ...syntaxDraft,
      inlineRules: syntaxDraft.inlineRules.filter((rule) => rule.id !== ruleId),
    });
  };

  return {
    actions: {
      addInlineRule: addSyntaxInlineRule,
      addMarkerRule: addSyntaxMarkerRule,
      removeInlineRule: removeSyntaxInlineRule,
      removeMarkerRule: removeSyntaxMarkerRule,
      updateInlineRule: updateSyntaxInlineRule,
      updateMarkerRule: updateSyntaxMarkerRule,
      updateName: updateSyntaxName,
      updateTabDisplayWidth: updateSyntaxTabDisplayWidth,
      updateTitleRule: updateSyntaxTitleRule,
      updateTopLevelUnmarkedRule: updateSyntaxTopLevelUnmarkedRule,
    },
    nameEditable,
    protectedInlineRuleIds: syntaxDraft.inlineRules
      .filter(isProtectedInlineRuleDraft)
      .map((rule) => rule.id),
    protectedInlineTriggerRuleIds,
    protectedMarkerRuleIds,
  };
}
