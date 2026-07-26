// SPDX-License-Identifier: GPL-3.0-or-later

import {
  analyzeCtnSource,
  type CtnCanonicalSourceAnalysis,
  type CtnEditableSourceAnalysis,
} from "../../../core/ctn/analysis/sourceAnalysis";
import { defaultCtnSyntax } from "../../../core/ctn/syntax/defaultSyntax";
import type {
  CtnCompiledSyntax,
} from "../../../core/ctn/syntax/types";

export function analyzeCanonicalTestSource(
  source: string,
  syntax: CtnCompiledSyntax = defaultCtnSyntax,
): CtnCanonicalSourceAnalysis {
  return analyzeCtnSource({
    mode: { kind: "canonical-document" },
    source,
    syntax,
  });
}

export function analyzeEditableTestSource(
  source: string,
  syntax: CtnCompiledSyntax = defaultCtnSyntax,
): CtnEditableSourceAnalysis {
  return analyzeCtnSource({
    mode: { kind: "editable-document" },
    source,
    syntax,
  });
}

export function analyzeBodyTestSource(
  source: string,
  title: string,
  syntax: CtnCompiledSyntax = defaultCtnSyntax,
): CtnEditableSourceAnalysis {
  return analyzeCtnSource({
    mode: { kind: "body", title },
    source,
    syntax,
  });
}

export function readCanonicalTestDocument(
  source: string,
  syntax: CtnCompiledSyntax = defaultCtnSyntax,
) {
  return analyzeCanonicalTestSource(source, syntax).document;
}

export function readEditableTestDocument(
  source: string,
  syntax: CtnCompiledSyntax = defaultCtnSyntax,
) {
  return analyzeEditableTestSource(source, syntax).document;
}

export function readBodyTestDocument(
  source: string,
  title: string,
  syntax: CtnCompiledSyntax = defaultCtnSyntax,
) {
  return analyzeBodyTestSource(source, title, syntax).document;
}
