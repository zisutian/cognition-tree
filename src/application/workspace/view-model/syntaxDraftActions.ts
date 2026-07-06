import {
  createNextInlineRuleDraft,
  createNextMarkerRuleDraft,
  isProtectedInlineRuleDraft,
  type SyntaxProfileDraft,
  type SyntaxProfileDraftConceptRule,
  type SyntaxProfileDraftInlineRule,
  type SyntaxProfileDraftMarkerRule,
} from "../../../ctn/syntax/profileDraft";
import type {
  UiSyntaxProfileDraftConceptRule,
  UiSyntaxProfileDraftInlineRule,
  UiSyntaxProfileDraftMarkerRule,
} from "../projection/viewSyntax";

export function createSyntaxDraftActions({
  syntaxDraft,
  updateSyntaxDraft,
}: {
  syntaxDraft: SyntaxProfileDraft;
  updateSyntaxDraft: (draft: SyntaxProfileDraft) => void;
}) {
  const updateSyntaxDraftField = (
    field: keyof Pick<SyntaxProfileDraft, "name" | "tabDisplayWidth">,
    value: string,
  ) => {
    updateSyntaxDraft({
      ...syntaxDraft,
      [field]: value,
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
      updateDraftField: updateSyntaxDraftField,
      updateInlineRule: updateSyntaxInlineRule,
      updateMarkerRule: updateSyntaxMarkerRule,
    },
    protectedInlineRuleIds: syntaxDraft.inlineRules
      .filter(isProtectedInlineRuleDraft)
      .map((rule) => rule.id),
  };
}
