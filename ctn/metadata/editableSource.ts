// SPDX-License-Identifier: GPL-3.0-or-later

import { parseCtnCanonicalDocument } from "../parser/parseCtnDocument.ts";
import type { CtnCanonicalDocument } from "../parser/types.ts";
import type { CtnSyntaxProfile } from "../syntax/types.ts";
import type { CtnBlockMetadataRecord } from "./blockMetadata.ts";

export type CtnEditableSource = {
  editableLineNumberByCanonicalLineNumber: ReadonlyMap<number, number>;
  metadataByLineNumber: ReadonlyMap<number, CtnBlockMetadataRecord>;
  source: string;
};

export function createCtnEditableSource(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
): CtnEditableSource {
  const document = parseCtnCanonicalDocument(source, syntaxProfile);

  return createCtnEditableSourceFromDocument(source, document);
}

export function createCtnEditableSourceFromDocument(
  source: string,
  document: Pick<CtnCanonicalDocument, "blocks">,
): CtnEditableSource {
  const lines = source.split("\n");
  const metadataBlockByLineNumber = new Map(
    document.blocks.map((block) => [block.metadataLineNumber, block]),
  );
  const editableLineNumberByCanonicalLineNumber = new Map<number, number>();
  const metadataByLineNumber = new Map<number, CtnBlockMetadataRecord>();
  const sourceLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const canonicalLineNumber = index + 1;
    const metadataBlock = metadataBlockByLineNumber.get(canonicalLineNumber);

    if (metadataBlock) {
      const editableLineNumber = sourceLines.length + 1;

      editableLineNumberByCanonicalLineNumber.set(
        canonicalLineNumber,
        editableLineNumber,
      );
      metadataByLineNumber.set(editableLineNumber, {
        id: metadataBlock.id,
        indentText: metadataBlock.indentText,
        ...metadataBlock.metadata,
      });
      continue;
    }

    sourceLines.push(lines[index]);
    editableLineNumberByCanonicalLineNumber.set(
      canonicalLineNumber,
      sourceLines.length,
    );
  }

  return {
    editableLineNumberByCanonicalLineNumber,
    metadataByLineNumber,
    source: sourceLines.join("\n"),
  };
}

export function getCtnEditableLineNumber(
  editableSource: CtnEditableSource,
  canonicalLineNumber: number,
) {
  const normalizedLineNumber = Math.max(1, Math.floor(canonicalLineNumber));

  return editableSource.editableLineNumberByCanonicalLineNumber.get(
    normalizedLineNumber,
  ) ?? Math.max(1, editableSource.source.split("\n").length);
}
