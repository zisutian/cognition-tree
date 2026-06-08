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

export type CtnInlineSpan = {
  id: string;
  type: CtnInlineSpanType;
  label: string;
  tone: CtnSyntaxTone;
  lineNumber: number;
  startColumn: number;
  endColumn: number;
  text: string;
};

export type CtnDiagnosticSeverity = "warning" | "error";

export type CtnDiagnosticCode =
  | "indent-level-jump"
  | "indent-not-multiple"
  | "mixed-indent"
  | "unknown-marker";

export type CtnDiagnostic = {
  id: string;
  code: CtnDiagnosticCode;
  severity: CtnDiagnosticSeverity;
  lineNumber: number;
  column: number;
  message: string;
};

export type CtnBlock = {
  id: string;
  lineNumber: number;
  endLineNumber: number;
  level: number;
  indentText: string;
  marker: string | null;
  type: CtnBlockType;
  role: CtnRuleRole;
  tone: CtnSyntaxTone;
  label: string;
  text: string;
  rawText: string;
  inlineSpans: CtnInlineSpan[];
  diagnostics: CtnDiagnostic[];
  children: CtnBlock[];
};

export type CtnDocument = {
  roots: CtnBlock[];
  blocks: CtnBlock[];
  diagnostics: CtnDiagnostic[];
};

export type OutlineNode = CtnBlock;

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

export type ParseCtnDocumentOptions = {
  syntaxProfile: CtnSyntaxProfile;
};
