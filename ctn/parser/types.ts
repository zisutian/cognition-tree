// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnBlockMetadata } from "../metadata/blockMetadata.ts";
import type {
  CtnBlockType,
  CtnInlineSpanType,
  CtnRuleRole,
  CtnSyntaxTone,
} from "../syntax/types.ts";

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
  | "reserved-directive"
  | "space-indent"
  | "title-line-invalid"
  | "unknown-marker"
  | "unknown-syntax"
  | "unterminated-multiline-block";

export type CtnDiagnostic = {
  id: string;
  code: CtnDiagnosticCode;
  severity: CtnDiagnosticSeverity;
  lineNumber: number;
  column: number;
  message: string;
};

export type CtnClosedMultilineRange = {
  closingFenceLineNumber: number;
  contentEndLineNumber: number;
  contentStartLineNumber: number;
  status: "closed";
};

export type CtnUnterminatedMultilineRange = {
  closingFenceLineNumber: null;
  contentEndLineNumber: number;
  contentStartLineNumber: number;
  status: "unterminated";
};

export type CtnMultilineRange =
  | CtnClosedMultilineRange
  | CtnUnterminatedMultilineRange;

type CtnBlockFields = {
  /** Exact source owned by this block, excluding canonical metadata. */
  contentFingerprint: string;
  diagnostics: CtnDiagnostic[];
  indentText: string;
  inlineSpans: CtnInlineSpan[];
  label: string;
  level: number;
  /** Last line lexically owned by this block (including a multiline body). */
  lexicalEndLineNumber: number;
  lineNumber: number;
  marker: string | null;
  multilineRange: CtnMultilineRange | null;
  rawText: string;
  role: CtnRuleRole;
  /** Last line owned by the complete structural subtree. */
  subtreeEndLineNumber: number;
  text: string;
  textColor: CtnSyntaxTone;
  textStartColumn: number;
  tone: CtnSyntaxTone;
  type: CtnBlockType;
};

export type CtnEditableBlock = CtnBlockFields & {
  children: CtnEditableBlock[];
};

export type CtnCanonicalBlock = CtnBlockFields & {
  children: CtnCanonicalBlock[];
  id: string;
  metadata: CtnBlockMetadata;
  metadataLineNumber: number;
};

export type CtnEditableDocument = {
  blocks: CtnEditableBlock[];
  diagnostics: CtnDiagnostic[];
  roots: CtnEditableBlock[];
};

export type CtnCanonicalDocument = {
  blocks: CtnCanonicalBlock[];
  diagnostics: CtnDiagnostic[];
  roots: CtnCanonicalBlock[];
};
