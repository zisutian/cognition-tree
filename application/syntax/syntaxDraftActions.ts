import {
  createNextCtnSyntaxBlockDraft,
  createNextCtnSyntaxInlineDraft,
  isProtectedCtnSyntaxInlineDraft,
  type CtnSyntaxDraft,
  type CtnSyntaxDraftBlock,
  type CtnSyntaxDraftDisplayRule,
  type CtnSyntaxDraftInline,
  normalizeCtnSyntaxTabDisplayWidthInput,
  ctnSyntaxSchema,
} from "../../core/ctn/index.ts";

import type { CtnSyntaxOwner } from "../../core/ctn/index.ts";

export function createSyntaxDraftActions({
  owner,
  syntaxDraft,
  updateSyntaxDraft,
}: {
  owner: CtnSyntaxOwner;
  syntaxDraft: CtnSyntaxDraft;
  updateSyntaxDraft: (draft: CtnSyntaxDraft) => void;
}) {
  const policy = ctnSyntaxSchema.owners[owner];
  const todoItemPolicy = policy.todoItem;
  const nameEditable = policy.fixedName === null;
  const protectedBlockRuleIds = todoItemPolicy
    ? syntaxDraft.blocks
      .filter(
        ({ semanticId }) =>
          semanticId === todoItemPolicy.semanticId,
      )
      .map(({ id }) => id)
    : [];
  const protectedInlineTriggerRuleIds = policy.globalReferenceTrigger
    ? syntaxDraft.inline
      .filter(
        ({ semanticId }) =>
          semanticId === ctnSyntaxSchema.requiredSemanticIds.globalReference,
      )
      .map(({ id }) => id)
    : [];
  const updateName = (name: string) => {
    if (!nameEditable) return;
    updateSyntaxDraft({ ...syntaxDraft, name });
  };
  const updateTabDisplayWidth = (value: string) => {
    updateSyntaxDraft({
      ...syntaxDraft,
      tabDisplayWidth: normalizeCtnSyntaxTabDisplayWidthInput(value),
    });
  };
  const updateBlock = (
    ruleId: string,
    patch: Partial<CtnSyntaxDraftBlock>,
  ) => {
    const protectedRule = protectedBlockRuleIds.includes(ruleId);

    updateSyntaxDraft({
      ...syntaxDraft,
      blocks: syntaxDraft.blocks.map((rule) => {
        if (rule.id !== ruleId) return rule;
        const updated = { ...rule, ...patch };

        return protectedRule && todoItemPolicy
          ? {
              ...updated,
              kind: todoItemPolicy.kind,
              label: todoItemPolicy.label,
              marker: todoItemPolicy.marker,
              semanticId: todoItemPolicy.semanticId,
            }
          : updated;
      }),
    });
  };
  const updateRoot = (patch: Partial<CtnSyntaxDraftDisplayRule>) => {
    if (!syntaxDraft.root) return;
    updateSyntaxDraft({
      ...syntaxDraft,
      root: { ...syntaxDraft.root, ...patch },
    });
  };
  const updateTitle = (patch: Partial<CtnSyntaxDraftDisplayRule>) => {
    if (!syntaxDraft.title) return;
    updateSyntaxDraft({
      ...syntaxDraft,
      title: { ...syntaxDraft.title, ...patch },
    });
  };
  const updateInline = (
    ruleId: string,
    patch: Partial<CtnSyntaxDraftInline>,
  ) => {
    const protectedTrigger = protectedInlineTriggerRuleIds.includes(ruleId);

    updateSyntaxDraft({
      ...syntaxDraft,
      inline: syntaxDraft.inline.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              ...patch,
              ...(protectedTrigger
                ? {
                    close: rule.close,
                    kind: rule.kind,
                    marker: rule.marker,
                    open: rule.open,
                  }
                : {}),
              semanticId:
                protectedTrigger || isProtectedCtnSyntaxInlineDraft(rule)
                  ? rule.semanticId
                  : patch.semanticId ?? rule.semanticId,
            }
          : rule
      ),
    });
  };
  const addBlock = () => {
    updateSyntaxDraft({
      ...syntaxDraft,
      blocks: [
        ...syntaxDraft.blocks,
        createNextCtnSyntaxBlockDraft(syntaxDraft.blocks),
      ],
    });
  };
  const removeBlock = (ruleId: string) => {
    if (protectedBlockRuleIds.includes(ruleId)) return;
    updateSyntaxDraft({
      ...syntaxDraft,
      blocks: syntaxDraft.blocks.filter((rule) => rule.id !== ruleId),
    });
  };
  const addInline = (kind: "paired" | "single") => {
    updateSyntaxDraft({
      ...syntaxDraft,
      inline: [
        ...syntaxDraft.inline,
        createNextCtnSyntaxInlineDraft(syntaxDraft.inline, kind),
      ],
    });
  };
  const removeInline = (ruleId: string) => {
    const rule = syntaxDraft.inline.find(({ id }) => id === ruleId);

    if (rule && isProtectedCtnSyntaxInlineDraft(rule)) return;
    updateSyntaxDraft({
      ...syntaxDraft,
      inline: syntaxDraft.inline.filter((candidate) =>
        candidate.id !== ruleId
      ),
    });
  };

  return {
    actions: {
      addBlock,
      addInline,
      removeBlock,
      removeInline,
      updateBlock,
      updateInline,
      updateName,
      updateRoot,
      updateTabDisplayWidth,
      updateTitle,
    },
    nameEditable,
    protectedBlockRuleIds,
    protectedInlineRuleIds: syntaxDraft.inline
      .filter(isProtectedCtnSyntaxInlineDraft)
      .map((rule) => rule.id),
    protectedInlineTriggerRuleIds,
  };
}
