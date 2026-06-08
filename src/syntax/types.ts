export type CtnBlockType = string;

export type CtnRuleRole = "normal" | "code";

export type CtnSyntaxTone =
  | "default"
  | "green"
  | "blue"
  | "amber"
  | "red"
  | "violet"
  | "code";

export type CtnInlineSpanType = string;

export type CtnMarkerRule = {
  marker: string;
  type: CtnBlockType;
  label: string;
  role: CtnRuleRole;
  tone: CtnSyntaxTone;
};

export type CtnInlineRuleBase = {
  type: CtnInlineSpanType;
  label: string;
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
  id: string;
  name: string;
  version: number;
  spaceIndentUnit: number;
  markerRules: CtnMarkerRule[];
  inlineRules: CtnInlineRule[];
};
