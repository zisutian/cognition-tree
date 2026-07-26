// SPDX-License-Identifier: GPL-3.0-or-later

export type CtnSyntaxOwner = "workspace" | "journal" | "todo";

export type CtnBlockSemanticId = string;

export type CtnBlockKind = "line" | "multiline";

export type CtnPresetSyntaxTone =
  | "green"
  | "teal"
  | "cyan"
  | "blue"
  | "indigo"
  | "amber"
  | "red"
  | "pink"
  | "violet"
  | "gray";

export type CtnCustomSyntaxTone = `#${string}`;

export type CtnSyntaxTone =
  | "default"
  | CtnPresetSyntaxTone
  | CtnCustomSyntaxTone;

export type CtnInlineSemanticId = string;

export type CtnSyntaxRuleStyle = {
  label: string;
  textColor: CtnSyntaxTone;
  tone: CtnSyntaxTone;
};

export type CtnSyntaxDisplayRule = CtnSyntaxRuleStyle;

export type CtnBlockRule = CtnSyntaxRuleStyle & {
  kind: CtnBlockKind;
  marker: string;
  semanticId: CtnBlockSemanticId;
};

export type CtnResolvedRootRule = CtnSyntaxRuleStyle & {
  kind: "line";
  marker: null;
  semanticId: "body" | "concept";
};

export type CtnResolvedTitleRule = CtnSyntaxRuleStyle & {
  kind: "line";
  marker: null;
  semanticId: "title";
};

export type CtnInlineRuleBase = CtnSyntaxRuleStyle & {
  semanticId: CtnInlineSemanticId;
};

export type CtnPairedInlineRule = CtnInlineRuleBase & {
  close: string;
  kind: "paired";
  open: string;
};

export type CtnSingleInlineRule = CtnInlineRuleBase & {
  kind: "single";
  marker: string;
};

export type CtnInlineRule = CtnPairedInlineRule | CtnSingleInlineRule;

/**
 * The exact source-backed CTN syntax v2 model.
 *
 * Fixed semantic identities are deliberately absent from title/root. They are
 * injected by the owner policy when the definition is compiled.
 */
export type CtnSyntaxDefinition = {
  blocks: CtnBlockRule[];
  formatVersion: 2;
  inline: CtnInlineRule[];
  name: string;
  root: CtnSyntaxDisplayRule | null;
  tabDisplayWidth: number;
  title: CtnSyntaxDisplayRule | null;
};

/**
 * Immutable runtime form shared by the parser, editor and domain indexes.
 * Matchers are preordered once so consumers never sort syntax rules.
 */
export type CtnCompiledSyntax = {
  analysisKey: string;
  blockGrammarKey: string;
  blockMatcher: readonly CtnBlockRule[];
  blocks: readonly CtnBlockRule[];
  definition: Readonly<CtnSyntaxDefinition>;
  formatVersion: 2;
  inline: readonly CtnInlineRule[];
  inlineGrammarKey: string;
  inlineMatcher: readonly CtnInlineRule[];
  name: string;
  owner: CtnSyntaxOwner;
  presentationKey: string;
  root: Readonly<CtnResolvedRootRule> | null;
  tabDisplayWidth: number;
  title: Readonly<CtnResolvedTitleRule>;
};
