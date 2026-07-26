// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnBlockMetadataRecord,
} from "../metadata/blockMetadata.ts";
import {
  parseCtnSourceText,
  type CtnDocumentParseMode,
} from "../parser/parseCtnDocument.ts";
import type {
  CtnCanonicalBlock,
  CtnCanonicalDocument,
  CtnEditableBlock,
  CtnEditableDocument,
  CtnDiagnostic,
  CtnInlineSpan,
  CtnMultilineRange,
  CtnResolvedBlockRule,
} from "../parser/types.ts";
import type {
  CtnCompiledSyntax,
} from "../syntax/types.ts";
import {
  createCtnSourceText,
  createCtnSourceTextFromLines,
  type CtnSourceText,
} from "./sourceText.ts";

export type CtnSourceMode = CtnDocumentParseMode;

export type CtnEditableProjection = {
  document: CtnEditableDocument;
  editableLineNumberByCanonicalLineNumber: ReadonlyMap<number, number>;
  lineCount: number;
  metadataByLineNumber: ReadonlyMap<number, CtnBlockMetadataRecord>;
  source: string;
  sourceText: CtnSourceText;
};

type CtnSourceAnalysisBase = {
  analysisKey: string;
  sourceText: CtnSourceText;
  syntax: CtnCompiledSyntax;
};

export type CtnEditableSourceAnalysis = CtnSourceAnalysisBase & {
  document: CtnEditableDocument;
  editableProjection: null;
  mode:
    | { kind: "body"; title: string }
    | { kind: "editable-document" };
};

export type CtnCanonicalSourceAnalysis = CtnSourceAnalysisBase & {
  document: CtnCanonicalDocument;
  editableProjection: CtnEditableProjection;
  mode: { kind: "canonical-document" };
};

export type CtnSourceAnalysis =
  | CtnCanonicalSourceAnalysis
  | CtnEditableSourceAnalysis;

export type AnalyzeCtnSourceInput = {
  mode: CtnSourceMode;
  source: string;
  syntax: CtnCompiledSyntax;
};

export type CanonicalizeCtnEditableAnalysisInput = {
  analysis: CtnEditableSourceAnalysis;
  canonicalSource: string;
  metadataByBlock: ReadonlyMap<CtnEditableBlock, CtnBlockMetadataRecord>;
};

function createEditableProjection(
  sourceText: CtnSourceText,
  document: CtnCanonicalDocument,
): CtnEditableProjection {
  const metadataByCanonicalLine = new Map(
    document.blocks.map((block) => [block.metadataLineNumber, block]),
  );
  const editableLineNumberByCanonicalLineNumber = new Map<number, number>();
  const metadataByLineNumber = new Map<number, CtnBlockMetadataRecord>();
  const editableLines: string[] = [];

  for (const line of sourceText.lines) {
    const metadataBlock = metadataByCanonicalLine.get(line.number);

    if (metadataBlock) {
      const editableLineNumber = editableLines.length + 1;

      editableLineNumberByCanonicalLineNumber.set(
        line.number,
        editableLineNumber,
      );
      metadataByLineNumber.set(editableLineNumber, {
        createdAt: metadataBlock.metadata.createdAt,
        id: metadataBlock.id,
        indentText: metadataBlock.indentText,
        updatedAt: metadataBlock.metadata.updatedAt,
      });
      continue;
    }
    editableLines.push(line.text);
    editableLineNumberByCanonicalLineNumber.set(
      line.number,
      editableLines.length,
    );
  }
  const projectedSourceText = createCtnSourceTextFromLines(editableLines);
  const projectLineNumber = (lineNumber: number) =>
    editableLineNumberByCanonicalLineNumber.get(lineNumber) ??
      projectedSourceText.lines.length;
  const projectDiagnostic = (
    diagnostic: CtnDiagnostic,
  ): CtnDiagnostic => {
    const lineNumber = projectLineNumber(diagnostic.lineNumber);

    return {
      ...diagnostic,
      id: `${lineNumber}-${diagnostic.column}-${diagnostic.code}`,
      lineNumber,
    };
  };
  const projectInlineSpan = (span: CtnInlineSpan): CtnInlineSpan => {
    const lineNumber = projectLineNumber(span.lineNumber);

    return {
      ...span,
      id: `${lineNumber}-${span.startColumn}-${span.rule.semanticId}`,
      lineNumber,
    };
  };
  const projectMultilineRange = (
    range: CtnMultilineRange | null,
  ): CtnMultilineRange | null => {
    if (!range) return null;

    return range.status === "closed"
      ? {
          closingFenceLineNumber: projectLineNumber(
            range.closingFenceLineNumber,
          ),
          contentEndLineNumber: projectLineNumber(
            range.contentEndLineNumber,
          ),
          contentStartLineNumber: projectLineNumber(
            range.contentStartLineNumber,
          ),
          status: range.status,
        }
      : {
          closingFenceLineNumber: null,
          contentEndLineNumber: projectLineNumber(
            range.contentEndLineNumber,
          ),
          contentStartLineNumber: projectLineNumber(
            range.contentStartLineNumber,
          ),
          status: range.status,
        };
  };
  const projectedByBlock = new Map<CtnCanonicalBlock, CtnEditableBlock>();
  const blocks = document.blocks.map((block): CtnEditableBlock => {
    const projected: CtnEditableBlock = {
      children: [],
      contentFingerprint: block.contentFingerprint,
      diagnostics: block.diagnostics.map(projectDiagnostic),
      indentText: block.indentText,
      inlineSpans: block.inlineSpans.map(projectInlineSpan),
      level: block.level,
      lexicalEndLineNumber: projectLineNumber(block.lexicalEndLineNumber),
      lineNumber: projectLineNumber(block.lineNumber),
      marker: block.marker,
      multilineRange: projectMultilineRange(block.multilineRange),
      rawText: block.rawText,
      rule: block.rule,
      subtreeEndLineNumber: projectLineNumber(block.subtreeEndLineNumber),
      text: block.text,
      textStartColumn: block.textStartColumn,
    };

    projectedByBlock.set(block, projected);
    return projected;
  });

  for (const block of document.blocks) {
    projectedByBlock.get(block)!.children = block.children.map(
      (child) => projectedByBlock.get(child)!,
    );
  }
  return {
    document: {
      blocks,
      diagnostics: document.diagnostics.map(projectDiagnostic),
      roots: document.roots.map((root) => projectedByBlock.get(root)!),
    },
    editableLineNumberByCanonicalLineNumber,
    lineCount: projectedSourceText.lines.length,
    metadataByLineNumber,
    source: projectedSourceText.source,
    sourceText: projectedSourceText,
  };
}

export function analyzeCtnSource(
  input: AnalyzeCtnSourceInput & {
    mode: { kind: "canonical-document" };
  },
): CtnCanonicalSourceAnalysis;
export function analyzeCtnSource(
  input: AnalyzeCtnSourceInput & {
    mode:
      | { kind: "body"; title: string }
      | { kind: "editable-document" };
  },
): CtnEditableSourceAnalysis;
export function analyzeCtnSource(
  input: AnalyzeCtnSourceInput,
): CtnSourceAnalysis;
export function analyzeCtnSource({
  mode,
  source,
  syntax,
}: AnalyzeCtnSourceInput): CtnSourceAnalysis {
  const sourceText = createCtnSourceText(source);
  const analysisKey = `${syntax.analysisKey}\u0000${mode.kind}\u0000${source}`;

  if (mode.kind === "canonical-document") {
    const canonicalDocument = parseCtnSourceText(sourceText, syntax, mode);

    return {
      analysisKey,
      document: canonicalDocument,
      editableProjection: createEditableProjection(
        sourceText,
        canonicalDocument,
      ),
      mode,
      sourceText,
      syntax,
    };
  }
  const editableDocument = parseCtnSourceText(sourceText, syntax, mode);

  return {
    analysisKey,
    document: editableDocument,
    editableProjection: null,
    mode,
    sourceText,
    syntax,
  };
}

/**
 * Builds the canonical projection of an already analyzed editable document.
 * Metadata insertion changes line coordinates but never CTN grammar facts, so
 * this projection deliberately does not invoke the parser a second time.
 */
export function canonicalizeCtnEditableAnalysis({
  analysis,
  canonicalSource,
  metadataByBlock,
}: CanonicalizeCtnEditableAnalysisInput): CtnCanonicalSourceAnalysis {
  if (analysis.mode.kind !== "editable-document") {
    throw new Error(
      "Only editable-document analysis can be canonicalized.",
    );
  }
  const editableDocument = analysis.document;
  const blocksStartingAtLine = new Map<number, CtnEditableBlock>();

  for (const block of editableDocument.blocks) {
    if (blocksStartingAtLine.has(block.lineNumber)) {
      throw new Error(
        `Multiple CTN blocks start at editable line ${block.lineNumber}.`,
      );
    }
    if (!metadataByBlock.has(block)) {
      throw new Error(
        `Missing CTN metadata for editable line ${block.lineNumber}.`,
      );
    }
    blocksStartingAtLine.set(block.lineNumber, block);
  }
  const canonicalLineByEditableLine = new Map<number, number>();
  let insertedMetadataLineCount = 0;

  for (
    let lineNumber = 1;
    lineNumber <= analysis.sourceText.lines.length;
    lineNumber += 1
  ) {
    if (blocksStartingAtLine.has(lineNumber)) {
      insertedMetadataLineCount += 1;
    }
    canonicalLineByEditableLine.set(
      lineNumber,
      lineNumber + insertedMetadataLineCount,
    );
  }
  const canonicalSourceText = createCtnSourceText(canonicalSource);

  if (
    canonicalSourceText.lines.length !==
      analysis.sourceText.lines.length + editableDocument.blocks.length
  ) {
    throw new Error(
      "Canonical CTN projection has an unexpected metadata line count.",
    );
  }
  const canonicalLine = (editableLineNumber: number) =>
    canonicalLineByEditableLine.get(editableLineNumber) ??
      canonicalSourceText.lines.length;
  const projectDiagnostic = (
    item: CtnDiagnostic,
  ): CtnDiagnostic => {
    const lineNumber = canonicalLine(item.lineNumber);

    return {
      ...item,
      id: `${lineNumber}-${item.column}-${item.code}`,
      lineNumber,
    };
  };
  const projectInlineSpan = (span: CtnInlineSpan): CtnInlineSpan => {
    const lineNumber = canonicalLine(span.lineNumber);

    return {
      ...span,
      id: `${lineNumber}-${span.startColumn}-${span.rule.semanticId}`,
      lineNumber,
    };
  };
  const projectMultilineRange = (
    range: CtnMultilineRange | null,
  ): CtnMultilineRange | null => {
    if (!range) return null;

    return range.status === "closed"
      ? {
          closingFenceLineNumber: canonicalLine(
            range.closingFenceLineNumber,
          ),
          contentEndLineNumber: canonicalLine(range.contentEndLineNumber),
          contentStartLineNumber: canonicalLine(
            range.contentStartLineNumber,
          ),
          status: "closed",
        }
      : {
          closingFenceLineNumber: null,
          contentEndLineNumber: canonicalLine(range.contentEndLineNumber),
          contentStartLineNumber: canonicalLine(
            range.contentStartLineNumber,
          ),
          status: "unterminated",
        };
  };
  const canonicalByEditable = new Map<
    CtnEditableBlock,
    CtnCanonicalBlock
  >();
  const blocks = editableDocument.blocks.map(
    (block): CtnCanonicalBlock => {
      const metadata = metadataByBlock.get(block)!;
      const lineNumber = canonicalLine(block.lineNumber);
      const canonicalBlock: CtnCanonicalBlock = {
        children: [],
        contentFingerprint: block.contentFingerprint,
        diagnostics: block.diagnostics.map(projectDiagnostic),
        id: metadata.id,
        indentText: block.indentText,
        inlineSpans: block.inlineSpans.map(projectInlineSpan),
        level: block.level,
        lexicalEndLineNumber: canonicalLine(block.lexicalEndLineNumber),
        lineNumber,
        marker: block.marker,
        metadata: {
          createdAt: metadata.createdAt,
          updatedAt: metadata.updatedAt,
        },
        metadataLineNumber: lineNumber - 1,
        multilineRange: projectMultilineRange(block.multilineRange),
        rawText: block.rawText,
        rule: block.rule,
        subtreeEndLineNumber: canonicalLine(block.subtreeEndLineNumber),
        text: block.text,
        textStartColumn: block.textStartColumn,
      };

      canonicalByEditable.set(block, canonicalBlock);
      return canonicalBlock;
    },
  );

  for (const block of editableDocument.blocks) {
    canonicalByEditable.get(block)!.children = block.children.map(
      (child) => canonicalByEditable.get(child)!,
    );
  }
  const document: CtnCanonicalDocument = {
    blocks,
    diagnostics: editableDocument.diagnostics.map(projectDiagnostic),
    roots: editableDocument.roots.map((root) => canonicalByEditable.get(root)!),
  };
  const editableLineNumberByCanonicalLineNumber = new Map<number, number>();
  const projectedMetadataByLineNumber = new Map<
    number,
    CtnBlockMetadataRecord
  >();

  for (
    let editableLineNumber = 1;
    editableLineNumber <= analysis.sourceText.lines.length;
    editableLineNumber += 1
  ) {
    const canonicalLineNumber = canonicalLine(editableLineNumber);
    const block = blocksStartingAtLine.get(editableLineNumber);

    editableLineNumberByCanonicalLineNumber.set(
      canonicalLineNumber,
      editableLineNumber,
    );
    if (block) {
      editableLineNumberByCanonicalLineNumber.set(
        canonicalLineNumber - 1,
        editableLineNumber,
      );
      projectedMetadataByLineNumber.set(
        editableLineNumber,
        metadataByBlock.get(block)!,
      );
    }
  }
  return {
    analysisKey:
      `${analysis.syntax.analysisKey}\u0000canonical-document\u0000${canonicalSource}`,
    document,
    editableProjection: {
      document: analysis.document,
      editableLineNumberByCanonicalLineNumber,
      lineCount: analysis.sourceText.lines.length,
      metadataByLineNumber: projectedMetadataByLineNumber,
      source: analysis.sourceText.source,
      sourceText: analysis.sourceText,
    },
    mode: { kind: "canonical-document" },
    sourceText: canonicalSourceText,
    syntax: analysis.syntax,
  };
}

function resolveCurrentBlockRule(
  rule: Readonly<CtnResolvedBlockRule>,
  syntax: CtnCompiledSyntax,
): Readonly<CtnResolvedBlockRule> {
  if (rule.semanticId === syntax.title.semanticId && rule.marker === null) {
    return syntax.title;
  }
  if (
    syntax.root &&
    rule.semanticId === syntax.root.semanticId &&
    rule.marker === null
  ) {
    return syntax.root;
  }
  if (rule.marker !== null) {
    return syntax.blocks.find(
      (candidate) =>
        candidate.marker === rule.marker &&
        candidate.kind === rule.kind &&
        candidate.semanticId === rule.semanticId,
    ) ?? rule;
  }
  return rule;
}

function reprojectInlineSpans(
  spans: readonly CtnInlineSpan[],
  syntax: CtnCompiledSyntax,
) {
  return spans.map((span): CtnInlineSpan => ({
    ...span,
    rule: syntax.inline.find(
      (candidate) =>
        candidate.kind === span.rule.kind &&
        candidate.semanticId === span.rule.semanticId,
    ) ?? span.rule,
  }));
}

function reprojectEditableDocument(
  document: CtnEditableDocument,
  syntax: CtnCompiledSyntax,
) {
  const blockMap = new Map<CtnEditableBlock, CtnEditableBlock>();
  const blocks = document.blocks.map((block): CtnEditableBlock => {
    const projected = {
      ...block,
      children: [],
      inlineSpans: reprojectInlineSpans(block.inlineSpans, syntax),
      rule: resolveCurrentBlockRule(block.rule, syntax),
    };

    blockMap.set(block, projected);
    return projected;
  });

  for (const block of document.blocks) {
    blockMap.get(block)!.children = block.children.map(
      (child) => blockMap.get(child)!,
    );
  }
  return {
    blockMap,
    document: {
      blocks,
      diagnostics: document.diagnostics,
      roots: document.roots.map((root) => blockMap.get(root)!),
    },
  };
}

function reprojectCanonicalDocument(
  document: CtnCanonicalDocument,
  syntax: CtnCompiledSyntax,
) {
  const blockMap = new Map<CtnCanonicalBlock, CtnCanonicalBlock>();
  const blocks = document.blocks.map((block): CtnCanonicalBlock => {
    const projected = {
      ...block,
      children: [],
      inlineSpans: reprojectInlineSpans(block.inlineSpans, syntax),
      rule: resolveCurrentBlockRule(block.rule, syntax),
    };

    blockMap.set(block, projected);
    return projected;
  });

  for (const block of document.blocks) {
    blockMap.get(block)!.children = block.children.map(
      (child) => blockMap.get(child)!,
    );
  }
  return {
    blockMap,
    document: {
      blocks,
      diagnostics: document.diagnostics,
      roots: document.roots.map((root) => blockMap.get(root)!),
    },
  };
}

function isCanonicalAnalysis(
  analysis: CtnSourceAnalysis,
): analysis is CtnCanonicalSourceAnalysis {
  return analysis.mode.kind === "canonical-document";
}

function equalRulePresentation(
  left: Readonly<{
    label: string;
    semanticId: string;
    textColor: string;
    tone: string;
  }> | null,
  right: Readonly<{
    label: string;
    semanticId: string;
    textColor: string;
    tone: string;
  }> | null,
) {
  return left === right ||
    (
      left !== null &&
      right !== null &&
      left.semanticId === right.semanticId &&
      left.label === right.label &&
      left.textColor === right.textColor &&
      left.tone === right.tone
    );
}

function hasSameParsedRulePresentation(
  previous: CtnCompiledSyntax,
  next: CtnCompiledSyntax,
) {
  if (
    !equalRulePresentation(previous.title, next.title) ||
    !equalRulePresentation(previous.root, next.root)
  ) {
    return false;
  }
  if (
    previous.blocks.length !== next.blocks.length ||
    previous.inline.length !== next.inline.length
  ) {
    return false;
  }
  const nextBlocks = new Map(
    next.blocks.map((rule) => [
      `${rule.kind}\u0000${rule.marker}\u0000${rule.semanticId}`,
      rule,
    ]),
  );
  const nextInline = new Map(
    next.inline.map((rule) => [
      `${rule.kind}\u0000${rule.semanticId}`,
      rule,
    ]),
  );

  return previous.blocks.every((rule) =>
    equalRulePresentation(
      rule,
      nextBlocks.get(
        `${rule.kind}\u0000${rule.marker}\u0000${rule.semanticId}`,
      ) ?? null,
    )
  ) &&
    previous.inline.every((rule) =>
      equalRulePresentation(
        rule,
        nextInline.get(`${rule.kind}\u0000${rule.semanticId}`) ?? null,
      )
    );
}

/**
 * Refreshes rule presentation without rescanning CTN source. This is valid
 * only when the compiled block and inline grammar keys are unchanged.
 */
export function reprojectCtnAnalysisPresentation(
  analysis: CtnEditableSourceAnalysis,
  syntax: CtnCompiledSyntax,
): CtnEditableSourceAnalysis;
export function reprojectCtnAnalysisPresentation(
  analysis: CtnCanonicalSourceAnalysis,
  syntax: CtnCompiledSyntax,
): CtnCanonicalSourceAnalysis;
export function reprojectCtnAnalysisPresentation(
  analysis: CtnSourceAnalysis,
  syntax: CtnCompiledSyntax,
): CtnSourceAnalysis;
export function reprojectCtnAnalysisPresentation(
  analysis: CtnSourceAnalysis,
  syntax: CtnCompiledSyntax,
): CtnSourceAnalysis {
  if (analysis.syntax.analysisKey !== syntax.analysisKey) {
    throw new Error(
      "CTN analysis presentation can only be refreshed for identical grammars.",
    );
  }
  if (hasSameParsedRulePresentation(analysis.syntax, syntax)) {
    return {
      ...analysis,
      syntax,
    };
  }
  if (isCanonicalAnalysis(analysis)) {
    const projected = reprojectCanonicalDocument(analysis.document, syntax);
    const editableProjected = reprojectEditableDocument(
      analysis.editableProjection.document,
      syntax,
    );

    return {
      ...analysis,
      document: projected.document,
      editableProjection: {
        ...analysis.editableProjection,
        document: editableProjected.document,
      },
      syntax,
    };
  }
  const projected = reprojectEditableDocument(analysis.document, syntax);

  return {
    ...analysis,
    document: projected.document,
    syntax,
  };
}
