// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiV1CtnBlockDto,
  ApiV1CtnDocumentDto,
  ApiV1ResourceVersionDto,
  ApiV1SyntaxGuideDto,
} from "../../../../contracts/api/types.ts";
import type { CtnCanonicalSourceAnalysis } from "../../../../core/ctn/analysis/sourceAnalysis.ts";
import {
  projectCtnCanonicalBlockBody,
  projectCtnEditableText,
} from "../../../../core/ctn/analysis/editableProjection.ts";
import { getCtnEditableLineNumber } from "../../../../core/ctn/metadata/editableSource.ts";
import type { CtnCanonicalBlock } from "../../../../core/ctn/parser/types.ts";
import type { CtnCompiledSyntax } from "../../../../core/ctn/syntax/types.ts";

export function projectApiV1SyntaxGuide(
  syntax: CtnCompiledSyntax,
): ApiV1SyntaxGuideDto {
  return {
    blocks: syntax.blocks.map(({ kind, label, marker, semanticId }) => ({
      kind,
      label,
      marker,
      semanticId,
    })),
    inline: syntax.inline.map((rule) => ({
      close: rule.kind === "paired" ? rule.close : null,
      kind: rule.kind,
      label: rule.label,
      open: rule.kind === "paired" ? rule.open : rule.marker,
      semanticId: rule.semanticId,
    })),
    name: syntax.name,
    root: syntax.root
      ? {
          label: syntax.root.label,
          semanticId: syntax.root.semanticId,
        }
      : null,
  };
}
function createParentBlockIdIndex(
  analysis: CtnCanonicalSourceAnalysis,
) {
  const result = new Map<CtnCanonicalBlock, string | null>();
  const pending = analysis.document.roots.map((block) => ({
    block,
    parentId: null as string | null,
  }));

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) continue;
    result.set(current.block, current.parentId);
    for (let index = current.block.children.length - 1; index >= 0; index -= 1) {
      const child = current.block.children[index];

      if (child) pending.push({ block: child, parentId: current.block.id });
    }
  }
  return result;
}

function projectApiV1Blocks({
  analysis,
  lineOffset,
  offset,
}: {
  analysis: CtnCanonicalSourceAnalysis;
  lineOffset: number;
  offset: number;
}): ApiV1CtnBlockDto[] {
  const editable = analysis.editableProjection;
  const parentByBlock = createParentBlockIdIndex(analysis);
  const included = analysis.document.blocks.filter(
    (block) => block.rule.semanticId !== analysis.syntax.title.semanticId ||
      lineOffset === 0,
  );
  const includedIds = new Set(included.map(({ id }) => id));

  return included.map((block, order) => {
    const lineNumber = getCtnEditableLineNumber(editable, block.lineNumber);
    const endLineNumber = getCtnEditableLineNumber(
      editable,
      block.lexicalEndLineNumber,
    );
    const startLine = editable.sourceText.lines[lineNumber - 1] ??
      editable.sourceText.lines[0]!;
    const endLine = editable.sourceText.lines[endLineNumber - 1] ?? startLine;
    const parentBlockId = parentByBlock.get(block) ?? null;

    return {
      blockId: block.id,
      body: projectCtnCanonicalBlockBody(analysis, block),
      createdAt: block.metadata.createdAt,
      endLineNumber: Math.max(1, endLineNumber - lineOffset),
      kind: block.rule.kind,
      label: block.rule.label,
      level: block.level,
      lineNumber: Math.max(1, lineNumber - lineOffset),
      order,
      parentBlockId: parentBlockId && includedIds.has(parentBlockId)
        ? parentBlockId
        : null,
      semanticId: block.rule.semanticId,
      sourceRange: {
        from: Math.max(0, startLine.from - offset),
        to: Math.max(0, endLine.to - offset),
      },
      text: block.text,
      updatedAt: block.metadata.updatedAt,
    };
  });
}

export function projectApiV1CtnDocument({
  analysis,
  createdAt,
  editableText,
  resourceId,
  textMode,
  title,
  updatedAt,
  version,
}: {
  analysis: CtnCanonicalSourceAnalysis;
  createdAt: string;
  editableText?: string;
  resourceId: string;
  textMode: "body" | "document";
  title: string;
  updatedAt: string;
  version: ApiV1ResourceVersionDto;
}): ApiV1CtnDocumentDto {
  const projection = projectCtnEditableText(analysis, textMode);
  const offset = projection.sourceOffset;
  const lineOffset = projection.lineOffset;
  const source = editableText ?? projection.source;

  return {
    blocks: projectApiV1Blocks({ analysis, lineOffset, offset }),
    createdAt,
    diagnostics: analysis.editableProjection.document.diagnostics
      .filter(({ lineNumber }) => lineNumber > lineOffset)
      .map(({ code, column, lineNumber, message, severity }) => ({
        code,
        column,
        lineNumber: lineNumber - lineOffset,
        message,
        severity,
      })),
    editableText: source,
    resourceId,
    textMode,
    title,
    updatedAt,
    version,
    writingGuide: projectApiV1SyntaxGuide(analysis.syntax),
  };
}
