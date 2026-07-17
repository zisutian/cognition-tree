// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseCtnCanonicalDocument,
  parseCtnEditableDocument,
  readCtnCanonicalTitleHeader,
} from "../parser/parseCtnDocument.ts";
import type { CtnEditableDocument } from "../parser/types.ts";
import type { CtnSyntaxProfile } from "../syntax/types.ts";
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

export function initializeCtnSourceBlockMetadata(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
  {
    createId,
    createdAt,
    reservedIds,
    updatedAt,
  }: InitializeCtnSourceBlockMetadataOptions,
) {
  const document = parseCtnEditableDocument(source, syntaxProfile);
  const idAllocator = createCtnBlockIdAllocator(createId, reservedIds);
  const metadataLines = document.blocks.map((block, index) =>
    formatCtnBlockMetadataLine({
      createdAt,
      id: idAllocator.allocate(),
      indentText: index === 0 ? "" : block.indentText,
      updatedAt,
    }),
  );

  return insertCtnBlockMetadataLines(source, document, metadataLines);
}

/**
 * Converts a syntax-free note from its title-header plus opaque-body shape to
 * a fully canonical CTN source after the workspace has accepted its first
 * syntax profile. The title metadata is already canonical and remains the
 * stable note identity; only blocks discovered in the opaque body receive new
 * identities.
 */
export function initializeCtnRawSourceBlockMetadata(
  rawSource: string,
  syntaxProfile: CtnSyntaxProfile,
  {
    allocateId,
    timestamp,
  }: InitializeCtnRawSourceBlockMetadataOptions,
) {
  const { metadata: titleMetadata } = readCtnCanonicalTitleHeader(rawSource);
  const editableSource = rawSource.split("\n").slice(1).join("\n");
  const document = parseCtnEditableDocument(editableSource, syntaxProfile);
  const metadataLines = document.blocks.map((block, index) =>
    formatCtnBlockMetadataLine(
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
    ),
  );

  const canonicalSource = insertCtnBlockMetadataLines(
    editableSource,
    document,
    metadataLines,
  );

  parseCtnCanonicalDocument(canonicalSource, syntaxProfile);
  return canonicalSource;
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
