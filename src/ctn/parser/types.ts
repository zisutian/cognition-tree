import type {
  CtnBlockType,
  CtnInlineSpanType,
  CtnRuleRole,
  CtnSyntaxTone,
} from "../syntax/types";

export type CtnInlineSpan = {
  id: string;
  type: CtnInlineSpanType;
  label: string;
  textColor: CtnSyntaxTone;
  tone: CtnSyntaxTone;
  lineNumber: number;
  startColumn: number;
  endColumn: number;
  text: string;
};

export type CtnDiagnosticSeverity = "warning" | "error";

export type CtnDiagnosticCode =
  | "indent-level-jump"
  | "space-indent"
  | "title-line-invalid"
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
  textColor: CtnSyntaxTone;
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
