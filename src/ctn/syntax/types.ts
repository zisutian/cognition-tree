export type CtnBlockType = string;

export type CtnRuleRole = "normal" | "multiline";

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

export type CtnInlineSpanType = string;

export type CtnMarkerRule = {
  marker: string;
  type: CtnBlockType;
  label: string;
  role: CtnRuleRole;
  textColor: CtnSyntaxTone;
  tone: CtnSyntaxTone;
};

export type CtnConceptRule = {
  type: CtnBlockType;
  label: string;
  textColor: CtnSyntaxTone;
  tone: CtnSyntaxTone;
};

export type CtnTitleRule = {
  type: CtnBlockType;
  label: string;
  textColor: CtnSyntaxTone;
  tone: CtnSyntaxTone;
};

export type CtnInlineRuleBase = {
  type: CtnInlineSpanType;
  label: string;
  textColor: CtnSyntaxTone;
  tone: CtnSyntaxTone;
};

export type CtnPairedInlineRule = CtnInlineRuleBase & {
  kind: "paired";
  open: string;
  close: string;
};

export type CtnSingleInlineRule = CtnInlineRuleBase & {
  kind: "single";
  marker: string;
};

export type CtnInlineRule = CtnPairedInlineRule | CtnSingleInlineRule;

export type CtnSyntaxProfile = {
  conceptRule: CtnConceptRule;
  titleRule: CtnTitleRule;
  name: string;
  tabDisplayWidth: number;
  markerRules: CtnMarkerRule[];
  inlineRules: CtnInlineRule[];
};
