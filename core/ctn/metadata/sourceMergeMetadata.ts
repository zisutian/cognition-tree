// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnCanonicalSourceAnalysis } from "../analysis/sourceAnalysis.ts";
import { formatCtnBlockMetadataLine } from "./blockMetadata.ts";

export function equalCtnSourceExceptModificationTime(
  left: CtnCanonicalSourceAnalysis,
  right: CtnCanonicalSourceAnalysis,
) {
  if (left.sourceText.source === right.sourceText.source) return true;
  const a = left.sourceText.values, b = right.sourceText.values;
  if (a.length !== b.length) return false;
  const leftMetadata = new Map(left.document.blocks.map(block => [block.metadataLineNumber, block]));
  const rightMetadata = new Map(right.document.blocks.map(block => [block.metadataLineNumber, block]));
  for (let index = 0; index < a.length; index++) {
    if (a[index] === b[index]) continue;
    const x = leftMetadata.get(index + 1), y = rightMetadata.get(index + 1);
    if (!x || !y || x.id !== y.id || x.indentText !== y.indentText || x.metadata.createdAt !== y.metadata.createdAt) return false;
  }
  return true;
}

export function mergeCtnSourceModificationTimes(
  selected: CtnCanonicalSourceAnalysis,
  observations: readonly CtnCanonicalSourceAnalysis[],
) {
  const candidates = observations.filter(candidate => candidate.sourceText.source !== selected.sourceText.source);
  if (candidates.length === 0) return selected.sourceText.source;
  const latest = new Map(selected.document.blocks.map(block => [block.id, { ...block.metadata }]));
  for (const candidate of candidates) {
    for (const block of candidate.document.blocks) {
      const current = latest.get(block.id);
      if (current?.createdAt === block.metadata.createdAt && Date.parse(block.metadata.updatedAt) > Date.parse(current.updatedAt)) {
        current.updatedAt = block.metadata.updatedAt;
      }
    }
  }
  let lines: string[] | null = null;
  for (const block of selected.document.blocks) {
    const updatedAt = latest.get(block.id)!.updatedAt;
    if (updatedAt === block.metadata.updatedAt) continue;
    lines ??= [...selected.sourceText.values];
    lines[block.metadataLineNumber - 1] = formatCtnBlockMetadataLine({
      ...block.metadata, id: block.id, indentText: block.indentText, updatedAt,
    });
  }
  return lines?.join("\n") ?? selected.sourceText.source;
}
