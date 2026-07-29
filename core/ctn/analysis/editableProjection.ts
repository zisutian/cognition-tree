// SPDX-License-Identifier: GPL-3.0-or-later

import {
  removeCtnBlockMetadataLines,
} from "../metadata/blockMetadata.ts";
import {
  getCtnEditableLineNumber,
} from "../metadata/editableSource.ts";
import type { CtnCanonicalBlock } from "../parser/types.ts";
import type {
  CtnCanonicalSourceAnalysis,
  CtnEditableProjection,
} from "./sourceAnalysis.ts";

export type CtnEditableTextMode = "body" | "document";

export type CtnEditableTextProjection = {
  lineOffset: number;
  source: string;
  sourceOffset: number;
};

function bodyOffset(editable: CtnEditableProjection) {
  const titleLine = editable.sourceText.lines[0];

  if (!titleLine || titleLine.to >= editable.source.length) {
    return editable.source.length;
  }
  return titleLine.to + 1;
}

export function projectCtnEditableText(
  analysis: CtnCanonicalSourceAnalysis,
  mode: CtnEditableTextMode,
): CtnEditableTextProjection {
  if (mode === "document") {
    return {
      lineOffset: 0,
      source: analysis.editableProjection.source,
      sourceOffset: 0,
    };
  }
  const sourceOffset = bodyOffset(analysis.editableProjection);

  return {
    lineOffset: 1,
    source: analysis.editableProjection.source.slice(sourceOffset),
    sourceOffset,
  };
}

export function projectRawCanonicalCtnBody(source: string) {
  const editableSource = removeCtnBlockMetadataLines(source);
  const lineEnd = editableSource.indexOf("\n");

  return lineEnd < 0 ? "" : editableSource.slice(lineEnd + 1);
}

export function projectCtnCanonicalBlockBody(
  analysis: CtnCanonicalSourceAnalysis,
  block: CtnCanonicalBlock,
) {
  const range = block.multilineRange;

  if (!range) return null;
  const editable = analysis.editableProjection;
  const start = getCtnEditableLineNumber(
    editable,
    range.contentStartLineNumber,
  );
  const end = getCtnEditableLineNumber(
    editable,
    range.contentEndLineNumber,
  );

  if (end < start) return "";
  return editable.sourceText.lines
    .slice(start - 1, end)
    .map(({ text }) => text)
    .join("\n");
}

export function findCtnEditableBlockLineNumber(
  analysis: CtnCanonicalSourceAnalysis,
  blockId: string,
  mode: CtnEditableTextMode,
) {
  const block = analysis.document.blocks.find(({ id }) => id === blockId);

  if (!block) return null;
  const lineNumber = getCtnEditableLineNumber(
    analysis.editableProjection,
    block.lineNumber,
  );

  return Math.max(1, lineNumber - (mode === "body" ? 1 : 0));
}
