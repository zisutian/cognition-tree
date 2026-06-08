export type CtnBlockType =
  | "concept"
  | "definition"
  | "component"
  | "personal-understanding"
  | "code"
  | "text";

export type CtnInlineSpanType =
  | "inline-code"
  | "local-reference"
  | "global-reference"
  | "parallel-separator";

export type CtnInlineSpan = {
  id: string;
  type: CtnInlineSpanType;
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
};

export type CtnSyntaxProfile = {
  id: string;
  name: string;
  version: number;
  spaceIndentUnit: number;
  markerRules: CtnMarkerRule[];
};

export type ParseCtnDocumentOptions = {
  syntaxProfile: CtnSyntaxProfile;
};
