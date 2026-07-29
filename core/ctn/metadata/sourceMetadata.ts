// SPDX-License-Identifier: GPL-3.0-or-later

import {
  analyzeCtnSource,
  canonicalizeCtnEditableAnalysis,
} from "../analysis/sourceAnalysis.ts";
import {
  readCtnCanonicalTitleHeader,
} from "../parser/parseCtnDocument.ts";
import type { CtnEditableDocument } from "../parser/types.ts";
import type { CtnCanonicalBlock } from "../parser/types.ts";
import type { CtnCompiledSyntax } from "../syntax/types.ts";
import {
  formatCtnBlockMetadataLine,
} from "./blockMetadata.ts";
import { createCtnBlockIdAllocator } from "./blockIdAllocator.ts";

export type InitializeCtnSourceBlockMetadataOptions = {
  createId: () => string;
  createdAt: string;
  reservedIds: ReadonlySet<string>;
  updatedAt: string;
};

export type InitializeCtnRawSourceBlockMetadataOptions = {
  allocateId: () => string;
  timestamp: string;
};

function insertCtnBlockMetadataLines(
  source: string,
  document: CtnEditableDocument,
  metadataLines: readonly string[],
) {
  const lines = source.split("\n");

  for (let index = document.blocks.length - 1; index >= 0; index -= 1) {
    lines.splice(
      document.blocks[index].lineNumber - 1,
      0,
      metadataLines[index],
    );
  }

  return lines.join("\n");
}

export function initializeCtnSourceBlockMetadataAnalysis(
  source: string,
  syntax: CtnCompiledSyntax,
  {
    createId,
    createdAt,
    reservedIds,
    updatedAt,
  }: InitializeCtnSourceBlockMetadataOptions,
) {
  const analysis = analyzeCtnSource({
    mode: { kind: "editable-document" },
    source,
    syntax,
  });
  const document = analysis.document;
  const idAllocator = createCtnBlockIdAllocator(createId, reservedIds);
  const metadataByBlock = new Map(document.blocks.map((block, index) => [
    block,
    {
      createdAt,
      id: idAllocator.allocate(),
      indentText: index === 0 ? "" : block.indentText,
      updatedAt,
    },
  ]));
  const metadataLines = document.blocks.map((block) =>
    formatCtnBlockMetadataLine(metadataByBlock.get(block)!)
  );
  const canonicalSource = insertCtnBlockMetadataLines(
    source,
    document,
    metadataLines,
  );

  return {
    analysis: canonicalizeCtnEditableAnalysis({
      analysis,
      canonicalSource,
      metadataByBlock,
    }),
    source: canonicalSource,
  };
}

export function initializeCtnSourceBlockMetadata(
  source: string,
  syntax: CtnCompiledSyntax,
  options: InitializeCtnSourceBlockMetadataOptions,
) {
  return initializeCtnSourceBlockMetadataAnalysis(
    source,
    syntax,
    options,
  ).source;
}

/**
 * Converts a syntax-free note from its title-header plus opaque-body shape to
 * a fully canonical CTN source after the workspace has accepted its first
 * syntax. The title metadata is already canonical and remains the
 * stable note identity; only blocks discovered in the opaque body receive new
 * identities.
 */
export function initializeCtnRawSourceBlockMetadataAnalysis(
  rawSource: string,
  syntax: CtnCompiledSyntax,
  {
    allocateId,
    timestamp,
  }: InitializeCtnRawSourceBlockMetadataOptions,
) {
  const { metadata: titleMetadata } = readCtnCanonicalTitleHeader(rawSource);
  const editableSource = rawSource.split("\n").slice(1).join("\n");
  const analysis = analyzeCtnSource({
    mode: { kind: "editable-document" },
    source: editableSource,
    syntax,
  });
  const document = analysis.document;
  const metadataByBlock = new Map(document.blocks.map((block, index) => [
    block,
    index === 0
      ? {
            ...titleMetadata,
            updatedAt: timestamp,
        }
      : {
            createdAt: timestamp,
            id: allocateId(),
            indentText: block.indentText,
            updatedAt: timestamp,
        },
  ]));
  const metadataLines = document.blocks.map((block) =>
    formatCtnBlockMetadataLine(metadataByBlock.get(block)!)
  );

  const canonicalSource = insertCtnBlockMetadataLines(
    editableSource,
    document,
    metadataLines,
  );

  return {
    analysis: canonicalizeCtnEditableAnalysis({
      analysis,
      canonicalSource,
      metadataByBlock,
    }),
    source: canonicalSource,
  };
}

export function initializeCtnRawSourceBlockMetadata(
  rawSource: string,
  syntax: CtnCompiledSyntax,
  options: InitializeCtnRawSourceBlockMetadataOptions,
) {
  return initializeCtnRawSourceBlockMetadataAnalysis(
    rawSource,
    syntax,
    options,
  ).source;
}

export function replaceCtnSourceTitle(
  source: string,
  title: string,
  updatedAt: string,
) {
  const lines = source.split("\n");
  const { metadata: titleMetadata } = readCtnCanonicalTitleHeader(source);

  lines[0] = formatCtnBlockMetadataLine({
    ...titleMetadata,
    updatedAt,
  });
  lines[1] = title;
  return lines.join("\n");
}

export function touchCtnSourceTitleMetadata(
  source: string,
  updatedAt: string,
) {
  const { title } = readCtnCanonicalTitleHeader(source);

  return replaceCtnSourceTitle(source, title, updatedAt);
}

export function touchCtnSourceBlockMetadata(
  source: string,
  block: CtnCanonicalBlock,
  updatedAt: string,
) {
  if (Date.parse(updatedAt) < Date.parse(block.metadata.updatedAt)) {
    throw new Error(`CTN block ${block.id} updatedAt cannot move backwards.`);
  }
  if (updatedAt === block.metadata.updatedAt) return source;
  const lines = source.split("\n");
  const lineIndex = block.metadataLineNumber - 1;

  if (lineIndex < 0 || lineIndex >= lines.length) {
    throw new Error(`CTN block ${block.id} metadata line is outside the source.`);
  }
  lines[lineIndex] = formatCtnBlockMetadataLine({
    ...block.metadata,
    id: block.id,
    indentText: block.indentText,
    updatedAt,
  });
  return lines.join("\n");
}
