// SPDX-License-Identifier: GPL-3.0-or-later

import {
  formatCtnBlockMetadataLine,
  type CtnBlockMetadataRecord,
} from "../metadata/blockMetadata.ts";
import type {
  CtnCanonicalBlock,
  CtnCanonicalDocument,
} from "../parser/types.ts";
import {
  analyzeCtnSource,
  type CtnCanonicalSourceAnalysis,
} from "./sourceAnalysis.ts";
import { createCtnSourceTextFromLines } from "./sourceText.ts";

type CanonicalBlockPlacement = {
  childIds: string[];
  parentId: string | null;
  siblingIndex: number;
};

export type AnalyzeCtnCanonicalMutationOptions = {
  touchTitle: boolean;
  updatedAt: string;
};

function createCanonicalBlockPlacements(document: CtnCanonicalDocument) {
  const placements = new Map<string, CanonicalBlockPlacement>();
  const pending = document.roots
    .map((block, siblingIndex) => ({
      block,
      parentId: null as string | null,
      siblingIndex,
    }))
    .reverse();

  while (pending.length > 0) {
    const entry = pending.pop();

    if (!entry) {
      continue;
    }
    placements.set(entry.block.id, {
      childIds: entry.block.children.map((child) => child.id),
      parentId: entry.parentId,
      siblingIndex: entry.siblingIndex,
    });
    for (let index = entry.block.children.length - 1; index >= 0; index -= 1) {
      pending.push({
        block: entry.block.children[index],
        parentId: entry.block.id,
        siblingIndex: index,
      });
    }
  }
  return placements;
}

function equalIds(left: readonly string[], right: readonly string[]) {
  return left.length === right.length &&
    left.every((id, index) => id === right[index]);
}

function replaceCanonicalMetadata(
  analysis: CtnCanonicalSourceAnalysis,
  metadataById: ReadonlyMap<string, CtnBlockMetadataRecord>,
) {
  const values = [...analysis.sourceText.values];
  const blockMap = new Map<CtnCanonicalBlock, CtnCanonicalBlock>();
  const blocks = analysis.document.blocks.map((block): CtnCanonicalBlock => {
    const metadata = metadataById.get(block.id);
    const next = metadata
      ? {
          ...block,
          children: [],
          metadata: {
            createdAt: metadata.createdAt,
            updatedAt: metadata.updatedAt,
          },
        }
      : { ...block, children: [] };

    blockMap.set(block, next);
    if (metadata) {
      values[block.metadataLineNumber - 1] =
        formatCtnBlockMetadataLine(metadata);
    }
    return next;
  });

  for (const block of analysis.document.blocks) {
    blockMap.get(block)!.children = block.children.map(
      (child) => blockMap.get(child)!,
    );
  }
  const document: CtnCanonicalDocument = {
    blocks,
    diagnostics: analysis.document.diagnostics,
    roots: analysis.document.roots.map((root) => blockMap.get(root)!),
  };
  const metadataByLineNumber =
    new Map(analysis.editableProjection.metadataByLineNumber);

  for (const block of blocks) {
    const metadata = metadataById.get(block.id);
    const editableLineNumber =
      analysis.editableProjection.editableLineNumberByCanonicalLineNumber.get(
        block.lineNumber,
      );

    if (metadata && editableLineNumber !== undefined) {
      metadataByLineNumber.set(editableLineNumber, metadata);
    }
  }
  const sourceText = createCtnSourceTextFromLines(values);

  return {
    ...analysis,
    analysisKey:
      `${analysis.syntax.analysisKey}\u0000canonical-document\u0000${sourceText.source}`,
    document,
    editableProjection: {
      ...analysis.editableProjection,
      metadataByLineNumber,
    },
    sourceText,
  } satisfies CtnCanonicalSourceAnalysis;
}

/**
 * Analyzes the canonical result of a structural text mutation exactly once,
 * then updates timestamps in the already-built analysis without reparsing.
 */
export function analyzeCtnCanonicalMutation(
  previous: CtnCanonicalSourceAnalysis,
  candidateSource: string,
  {
    touchTitle,
    updatedAt,
  }: AnalyzeCtnCanonicalMutationOptions,
) {
  const candidate = analyzeCtnSource({
    mode: { kind: "canonical-document" },
    source: candidateSource,
    syntax: previous.syntax,
  });
  const previousBlockById = new Map(
    previous.document.blocks.map((block) => [block.id, block]),
  );
  const previousPlacements = createCanonicalBlockPlacements(previous.document);
  const candidatePlacements = createCanonicalBlockPlacements(candidate.document);
  const changedMetadata = new Map<string, CtnBlockMetadataRecord>();

  for (const block of candidate.document.blocks) {
    const previousBlock = previousBlockById.get(block.id);
    const previousPlacement = previousPlacements.get(block.id);
    const candidatePlacement = candidatePlacements.get(block.id);
    const changed = !previousBlock ||
      (touchTitle && block.rule.semanticId === "title") ||
      previousBlock.contentFingerprint !== block.contentFingerprint ||
      previousBlock.indentText !== block.indentText ||
      previousPlacement?.parentId !== candidatePlacement?.parentId ||
      previousPlacement?.siblingIndex !== candidatePlacement?.siblingIndex ||
      !equalIds(
        previousPlacement?.childIds ?? [],
        candidatePlacement?.childIds ?? [],
      );

    if (changed) {
      changedMetadata.set(block.id, {
        createdAt: block.metadata.createdAt,
        id: block.id,
        indentText: block.indentText,
        updatedAt,
      });
    }
  }

  return changedMetadata.size === 0
    ? candidate
    : replaceCanonicalMetadata(candidate, changedMetadata);
}
