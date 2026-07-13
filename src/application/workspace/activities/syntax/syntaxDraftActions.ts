import {
  createNextInlineRuleDraft,
  createNextMarkerRuleDraft,
  isProtectedInlineRuleDraft,
  normalizeSyntaxTabDisplayWidthInput,
  type SyntaxProfileDraft,
  type SyntaxProfileDraftConceptRule,
  type SyntaxProfileDraftInlineRule,
  type SyntaxProfileDraftMarkerRule,
  type SyntaxProfileDraftTitleRule,
} from "../../../../ctn/syntax/profileDraft";
import type {
  UiSyntaxProfileDraftConceptRule,
  UiSyntaxProfileDraftInlineRule,
  UiSyntaxProfileDraftMarkerRule,
  UiSyntaxProfileDraftTitleRule,
} from "../../projection/viewSyntax";

export function createSyntaxDraftActions({
  syntaxDraft,
  updateSyntaxDraft,
}: {
  syntaxDraft: SyntaxProfileDraft;
  updateSyntaxDraft: (draft: SyntaxProfileDraft) => void;
}) {
  const updateSyntaxName = (name: string) => {
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
    updateSyntaxDraft({
      ...syntaxDraft,
      markerRules: syntaxDraft.markerRules.map((rule) =>
        rule.id === ruleId
          ? { ...rule, ...(patch as Partial<SyntaxProfileDraftMarkerRule>) }
          : rule,
      ),
    });
  };
  const updateSyntaxConceptRule = (
    patch: Partial<UiSyntaxProfileDraftConceptRule>,
  ) => {
    updateSyntaxDraft({
      ...syntaxDraft,
      conceptRule: {
        ...syntaxDraft.conceptRule,
        ...(patch as Partial<SyntaxProfileDraftConceptRule>),
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
    updateSyntaxDraft({
      ...syntaxDraft,
      inlineRules: syntaxDraft.inlineRules.map((rule) =>
        rule.id === ruleId
          ? { ...rule, ...(patch as Partial<SyntaxProfileDraftInlineRule>) }
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
      updateConceptRule: updateSyntaxConceptRule,
      updateInlineRule: updateSyntaxInlineRule,
      updateMarkerRule: updateSyntaxMarkerRule,
      updateName: updateSyntaxName,
      updateTabDisplayWidth: updateSyntaxTabDisplayWidth,
      updateTitleRule: updateSyntaxTitleRule,
    },
    protectedInlineRuleIds: syntaxDraft.inlineRules
      .filter(isProtectedInlineRuleDraft)
      .map((rule) => rule.id),
  };
}
