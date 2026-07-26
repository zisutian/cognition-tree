// SPDX-License-Identifier: GPL-3.0-or-later

import {
  compileCtnSyntaxDefinition,
} from "./compiler.ts";
import {
  ctnSyntaxSchema,
} from "./schema.ts";
import type {
  CtnBlockKind,
  CtnCompiledSyntax,
  CtnSyntaxDefinition,
  CtnSyntaxOwner,
  CtnSyntaxTone,
} from "./types.ts";

export type CtnSyntaxDraftBlock = {
  id: string;
  kind: CtnBlockKind;
  label: string;
  marker: string;
  semanticId: string;
  textColor: CtnSyntaxTone;
  tone: CtnSyntaxTone;
};

export type CtnSyntaxDraftDisplayRule = {
  id: string;
  label: string;
  textColor: CtnSyntaxTone;
  tone: CtnSyntaxTone;
};

export type CtnSyntaxDraftInline = {
  close: string;
  id: string;
  kind: "paired" | "single";
  label: string;
  marker: string;
  open: string;
  semanticId: string;
  tone: CtnSyntaxTone;
};

export type CtnSyntaxDraft = {
  blocks: CtnSyntaxDraftBlock[];
  inline: CtnSyntaxDraftInline[];
  name: string;
  root: CtnSyntaxDraftDisplayRule | null;
  tabDisplayWidth: string;
  title: CtnSyntaxDraftDisplayRule | null;
};

export type CtnSyntaxDraftBuildResult =
  | {
      definition: CtnSyntaxDefinition;
      diagnostics: [];
      syntax: CtnCompiledSyntax;
    }
  | {
      definition: CtnSyntaxDefinition;
      diagnostics: ReturnType<typeof compileCtnSyntaxDefinition>["diagnostics"];
      syntax: null;
    };

function draftId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

function nextDraftIndex<T extends { id: string }>(
  drafts: readonly T[],
  prefix: string,
) {
  const idPrefix = `${prefix}-`;

  return drafts.reduce((maximum, draft) => {
    if (!draft.id.startsWith(idPrefix)) return maximum;
    const index = Number(draft.id.slice(idPrefix.length));
    return Number.isInteger(index) && index > maximum ? index : maximum;
  }, 0);
}

function sortGlobalReferenceFirst<
  T extends { semanticId: string },
>(rules: readonly T[]) {
  return [...rules].sort((left, right) => {
    const required = ctnSyntaxSchema.requiredSemanticIds.globalReference;
    if (left.semanticId === required) return -1;
    if (right.semanticId === required) return 1;
    return 0;
  });
}

export function isProtectedCtnSyntaxInlineDraft(
  rule: CtnSyntaxDraftInline,
) {
  return rule.semanticId ===
    ctnSyntaxSchema.requiredSemanticIds.globalReference;
}

export function createEmptyCtnSyntaxBlockDraft(
  index: number,
): CtnSyntaxDraftBlock {
  return {
    id: draftId("block", index),
    kind: "line",
    label: "",
    marker: "",
    semanticId: `block-rule-${index + 1}`,
    textColor: "green",
    tone: "green",
  };
}

export function createNextCtnSyntaxBlockDraft(
  blocks: readonly CtnSyntaxDraftBlock[],
) {
  return createEmptyCtnSyntaxBlockDraft(nextDraftIndex(blocks, "block"));
}

export function createEmptyCtnSyntaxInlineDraft(
  index: number,
  kind: "paired" | "single" = "paired",
): CtnSyntaxDraftInline {
  return {
    close: "",
    id: draftId("inline", index),
    kind,
    label: "",
    marker: "",
    open: "",
    semanticId: `inline-rule-${index + 1}`,
    tone: "green",
  };
}

export function createNextCtnSyntaxInlineDraft(
  inline: readonly CtnSyntaxDraftInline[],
  kind: "paired" | "single" = "paired",
) {
  return createEmptyCtnSyntaxInlineDraft(
    nextDraftIndex(inline, "inline"),
    kind,
  );
}

export function createCtnSyntaxDraft(
  syntax: CtnCompiledSyntax,
): CtnSyntaxDraft {
  const definition = syntax.definition;

  return {
    blocks: definition.blocks.map((rule, index) => ({
      ...rule,
      id: draftId("block", index),
    })),
    inline: sortGlobalReferenceFirst(definition.inline).map((rule, index) => ({
      close: rule.kind === "paired" ? rule.close : "",
      id: draftId("inline", index),
      kind: rule.kind,
      label: rule.label,
      marker: rule.kind === "single" ? rule.marker : "",
      open: rule.kind === "paired" ? rule.open : "",
      semanticId: rule.semanticId,
      tone: rule.tone,
    })),
    name: definition.name,
    root: definition.root
      ? { ...definition.root, id: "root-1" }
      : null,
    tabDisplayWidth: String(definition.tabDisplayWidth),
    title: definition.title
      ? { ...definition.title, id: "title-1" }
      : null,
  };
}

export function buildCtnSyntaxDraft(
  draft: CtnSyntaxDraft,
  owner: CtnSyntaxOwner,
): CtnSyntaxDraftBuildResult {
  const policy = ctnSyntaxSchema.owners[owner];
  const todoItemPolicy = policy.todoItem;
  const definition: CtnSyntaxDefinition = {
    blocks: draft.blocks.map(({ id: _id, ...rule }) => {
      const isTodoItem = todoItemPolicy !== null &&
        rule.semanticId === todoItemPolicy.semanticId;

      return {
        ...rule,
        kind: isTodoItem ? todoItemPolicy.kind : rule.kind,
        label: isTodoItem ? todoItemPolicy.label : rule.label.trim(),
        marker: isTodoItem ? todoItemPolicy.marker : rule.marker,
        semanticId: isTodoItem
          ? todoItemPolicy.semanticId
          : rule.semanticId.trim(),
        tone: rule.tone,
      };
    }),
    formatVersion: 2,
    inline: draft.inline.map((rule) =>
      rule.kind === "paired"
        ? {
            close: rule.close,
            kind: rule.kind,
            label: rule.label.trim(),
            open: rule.open,
            semanticId: rule.semanticId.trim(),
            textColor: rule.tone,
            tone: rule.tone,
          }
        : {
            kind: rule.kind,
            label: rule.label.trim(),
            marker: rule.marker,
            semanticId: rule.semanticId.trim(),
            textColor: rule.tone,
            tone: rule.tone,
          }),
    name: draft.name.trim(),
    root: draft.root
      ? {
          label: draft.root.label.trim(),
          textColor: draft.root.textColor,
          tone: draft.root.tone,
        }
      : null,
    tabDisplayWidth: Number(draft.tabDisplayWidth.trim()),
    title: draft.title
      ? {
          label: draft.title.label.trim(),
          textColor: draft.title.textColor,
          tone: draft.title.tone,
        }
      : null,
  };
  const result = compileCtnSyntaxDefinition(definition, owner);

  return result.syntax
    ? {
        definition,
        diagnostics: [],
        syntax: result.syntax,
      }
    : {
        definition,
        diagnostics: result.diagnostics,
        syntax: null,
      };
}
