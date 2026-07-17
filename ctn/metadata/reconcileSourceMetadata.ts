// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseCtnCanonicalDocument,
  parseCtnEditableDocument,
} from "../parser/parseCtnDocument.ts";
import type {
  CtnCanonicalBlock,
  CtnCanonicalDocument,
  CtnEditableBlock,
  CtnEditableDocument,
} from "../parser/types.ts";
import type { CtnSyntaxProfile } from "../syntax/types.ts";
import {
  formatCtnBlockMetadataLine,
  type CtnBlockMetadataRecord,
} from "./blockMetadata.ts";
import { createCtnBlockIdAllocator } from "./blockIdAllocator.ts";
import { createCtnEditableSourceFromDocument } from "./editableSource.ts";
import {
  assertCtnEditableSourceChange,
  mapCtnTextOffset,
  type CtnEditableSourceChange,
  type CtnTextEdit,
} from "./textEdits.ts";

export type ReconcileCtnSourceBlockMetadataOptions = {
  createId: () => string;
  reservedIds: ReadonlySet<string>;
  timestamp: string;
};

export type RecanonicalizeCtnSourceBlockMetadataOptions = {
  allocateId: () => string;
  timestamp: string;
};

type BlockOffsetRange = {
  end: number;
  endExclusive: number;
  start: number;
};

type BlockPlacement = {
  childIds: string[];
  parentId: string | null;
  siblingIndex: number;
};

function createLineStartOffsets(source: string) {
  const offsets = [0];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      offsets.push(index + 1);
    }
  }

  return offsets;
}

function createBlockOffsetRange(
  block: CtnEditableBlock,
  source: string,
  lineStartOffsets: readonly number[],
): BlockOffsetRange {
  const start = lineStartOffsets[block.lineNumber - 1] ?? source.length;
  const lineAfterBlockStart = lineStartOffsets[block.lexicalEndLineNumber];
  const endExclusive = lineAfterBlockStart ?? source.length;
  const end = lineAfterBlockStart === undefined
    ? source.length
    : Math.max(start, lineAfterBlockStart - 1);

  return { end, endExclusive, start };
}

function isBlockDeletedByEdit(
  range: BlockOffsetRange,
  edits: readonly CtnTextEdit[],
) {
  return edits.some(
    (edit) =>
      edit.insertedText.length === 0 &&
      edit.from <= range.start &&
      edit.to >= range.endExclusive &&
      edit.to > edit.from,
  );
}

function findBlockRangeIndexAtOffset(
  ranges: readonly BlockOffsetRange[],
  offset: number,
) {
  let low = 0;
  let high = ranges.length - 1;

  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const range = ranges[middle];

    if (!range) {
      return -1;
    }
    if (offset < range.start) {
      high = middle - 1;
    } else if (offset > range.end) {
      low = middle + 1;
    } else {
      return middle;
    }
  }

  return -1;
}

function assignExistingBlockIds({
  candidateDocument,
  change,
  previousDocument,
  previousEditableDocument,
  previousEditableSource,
}: {
  candidateDocument: CtnEditableDocument;
  change: CtnEditableSourceChange;
  previousDocument: CtnCanonicalDocument;
  previousEditableDocument: CtnEditableDocument;
  previousEditableSource: string;
}) {
  if (previousDocument.blocks.length !== previousEditableDocument.blocks.length) {
    throw new Error("Canonical and editable CTN block projections diverged.");
  }

  const previousLineStarts = createLineStartOffsets(previousEditableSource);
  const candidateLineStarts = createLineStartOffsets(change.source);
  const candidateRanges = candidateDocument.blocks.map((block) =>
    createBlockOffsetRange(block, change.source, candidateLineStarts)
  );
  const assignedIds = new Map<CtnEditableBlock, string>();

  previousEditableDocument.blocks.forEach((previousBlock, previousIndex) => {
    const previousRange = createBlockOffsetRange(
      previousBlock,
      previousEditableSource,
      previousLineStarts,
    );

    if (isBlockDeletedByEdit(previousRange, change.edits)) {
      return;
    }

    const anchorOffset = previousRange.start + previousBlock.textStartColumn - 1;
    const mappedAnchorOffset = mapCtnTextOffset(anchorOffset, change.edits);
    const candidateIndex = findBlockRangeIndexAtOffset(
      candidateRanges,
      mappedAnchorOffset,
    );

    if (candidateIndex < 0) {
      return;
    }

    const candidate = candidateDocument.blocks[candidateIndex];

    if (!assignedIds.has(candidate)) {
      assignedIds.set(candidate, previousDocument.blocks[previousIndex].id);
    }
  });

  return assignedIds;
}

function assignNewBlockIds({
  assignedIds,
  candidateDocument,
  allocateId,
}: {
  assignedIds: Map<CtnEditableBlock, string>;
  candidateDocument: CtnEditableDocument;
  allocateId: () => string;
}) {
  candidateDocument.blocks.forEach((block) => {
    if (!assignedIds.has(block)) {
      assignedIds.set(block, allocateId());
    }
  });
}

function createCanonicalPlacements(document: CtnCanonicalDocument) {
  const placements = new Map<string, BlockPlacement>();
  const pending: Array<{
    block: CtnCanonicalBlock;
    parentId: string | null;
    siblingIndex: number;
  }> = document.roots
    .map((block, siblingIndex) => ({
      block,
      parentId: null,
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

function createEditablePlacements(
  document: CtnEditableDocument,
  assignedIds: ReadonlyMap<CtnEditableBlock, string>,
) {
  const placements = new Map<string, BlockPlacement>();
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

    const id = assignedIds.get(entry.block);

    if (!id) {
      throw new Error("CTN block metadata reconciliation left a block unassigned.");
    }

    placements.set(id, {
      childIds: entry.block.children.map((child) => {
        const childId = assignedIds.get(child);

        if (!childId) {
          throw new Error("CTN child block metadata was not assigned.");
        }

        return childId;
      }),
      parentId: entry.parentId,
      siblingIndex: entry.siblingIndex,
    });

    for (let index = entry.block.children.length - 1; index >= 0; index -= 1) {
      pending.push({
        block: entry.block.children[index],
        parentId: id,
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

function hasCandidateBlockChanged({
  block,
  candidatePlacements,
  id,
  previousBlockById,
  previousPlacements,
}: {
  block: CtnEditableBlock;
  candidatePlacements: ReadonlyMap<string, BlockPlacement>;
  id: string;
  previousBlockById: ReadonlyMap<string, CtnCanonicalBlock>;
  previousPlacements: ReadonlyMap<string, BlockPlacement>;
}) {
  const previousBlock = previousBlockById.get(id);
  const previousPlacement = previousPlacements.get(id);
  const candidatePlacement = candidatePlacements.get(id);

  return !previousBlock ||
    previousBlock.contentFingerprint !== block.contentFingerprint ||
    previousBlock.indentText !== block.indentText ||
    previousPlacement?.parentId !== candidatePlacement?.parentId ||
    previousPlacement?.siblingIndex !== candidatePlacement?.siblingIndex ||
    !equalIds(
      previousPlacement?.childIds ?? [],
      candidatePlacement?.childIds ?? [],
    );
}

function hasCanonicalStructureChanged({
  assignedIds,
  candidateDocument,
  previousDocument,
}: {
  assignedIds: ReadonlyMap<CtnEditableBlock, string>;
  candidateDocument: CtnEditableDocument;
  previousDocument: CtnCanonicalDocument;
}) {
  if (candidateDocument.blocks.length !== previousDocument.blocks.length) {
    return true;
  }

  const previousBlockById = new Map(
    previousDocument.blocks.map((block) => [block.id, block]),
  );
  const previousPlacements = createCanonicalPlacements(previousDocument);
  const candidatePlacements = createEditablePlacements(
    candidateDocument,
    assignedIds,
  );

  return candidateDocument.blocks.some((block) => {
    const id = assignedIds.get(block);

    if (!id) {
      throw new Error("CTN block metadata reconciliation left a block unassigned.");
    }

    return hasCandidateBlockChanged({
      block,
      candidatePlacements,
      id,
      previousBlockById,
      previousPlacements,
    });
  });
}

function createMetadataByCandidateBlock({
  assignedIds,
  candidateDocument,
  previousDocument,
  timestamp,
  touchTitle,
}: {
  assignedIds: ReadonlyMap<CtnEditableBlock, string>;
  candidateDocument: CtnEditableDocument;
  previousDocument: CtnCanonicalDocument;
  timestamp: string;
  touchTitle: boolean;
}) {
  const previousBlockById = new Map(
    previousDocument.blocks.map((block) => [block.id, block]),
  );
  const previousPlacements = createCanonicalPlacements(previousDocument);
  const candidatePlacements = createEditablePlacements(
    candidateDocument,
    assignedIds,
  );
  const metadataByBlock = new Map<
    CtnEditableBlock,
    CtnBlockMetadataRecord
  >();

  candidateDocument.blocks.forEach((block) => {
    const id = assignedIds.get(block);

    if (!id) {
      throw new Error("CTN block metadata reconciliation left a block unassigned.");
    }

    const previousBlock = previousBlockById.get(id);
    const changed = block.type === "title"
      ? touchTitle
      : hasCandidateBlockChanged({
          block,
          candidatePlacements,
          id,
          previousBlockById,
          previousPlacements,
        });

    metadataByBlock.set(block, {
      createdAt: previousBlock?.metadata.createdAt ?? timestamp,
      id,
      indentText: block.type === "title" ? "" : block.indentText,
      updatedAt: changed
        ? timestamp
        : previousBlock?.metadata.updatedAt ?? timestamp,
    });
  });

  return metadataByBlock;
}

function insertCanonicalMetadataLines(
  source: string,
  document: CtnEditableDocument,
  metadataByBlock: ReadonlyMap<CtnEditableBlock, CtnBlockMetadataRecord>,
) {
  const lines = source.split("\n");

  for (let index = document.blocks.length - 1; index >= 0; index -= 1) {
    const block = document.blocks[index];
    const metadata = metadataByBlock.get(block);

    if (!metadata) {
      throw new Error("Missing reconciled CTN block metadata.");
    }

    lines.splice(
      block.lineNumber - 1,
      0,
      formatCtnBlockMetadataLine(metadata),
    );
  }

  return lines.join("\n");
}

export function reconcileCtnSourceBlockMetadata(
  previousSource: string,
  change: CtnEditableSourceChange,
  syntaxProfile: CtnSyntaxProfile,
  {
    createId,
    reservedIds,
    timestamp,
  }: ReconcileCtnSourceBlockMetadataOptions,
) {
  const previousDocument = parseCtnCanonicalDocument(
    previousSource,
    syntaxProfile,
  );
  const previousEditableSource = createCtnEditableSourceFromDocument(
    previousSource,
    previousDocument,
  ).source;

  assertCtnEditableSourceChange(previousEditableSource, change);

  if (previousEditableSource === change.source) {
    return previousSource;
  }

  const previousEditableDocument = parseCtnEditableDocument(
    previousEditableSource,
    syntaxProfile,
  );
  const candidateDocument = parseCtnEditableDocument(
    change.source,
    syntaxProfile,
  );
  const assignedIds = assignExistingBlockIds({
    candidateDocument,
    change,
    previousDocument,
    previousEditableDocument,
    previousEditableSource,
  });
  const idAllocator = createCtnBlockIdAllocator(createId, reservedIds);

  previousDocument.blocks.forEach((block) => idAllocator.reserve(block.id));
  assignedIds.forEach((id) => idAllocator.reserve(id));

  assignNewBlockIds({
    assignedIds,
    allocateId: idAllocator.allocate,
    candidateDocument,
  });

  const canonicalSource = insertCanonicalMetadataLines(
    change.source,
    candidateDocument,
    createMetadataByCandidateBlock({
      assignedIds,
      candidateDocument,
      previousDocument,
      timestamp,
      touchTitle: true,
    }),
  );

  parseCtnCanonicalDocument(canonicalSource, syntaxProfile);
  return canonicalSource;
}

export function recanonicalizeCtnSourceBlockMetadata(
  previousSource: string,
  previousSyntaxProfile: CtnSyntaxProfile,
  nextSyntaxProfile: CtnSyntaxProfile,
  {
    allocateId,
    timestamp,
  }: RecanonicalizeCtnSourceBlockMetadataOptions,
) {
  const previousDocument = parseCtnCanonicalDocument(
    previousSource,
    previousSyntaxProfile,
  );
  const editableSource = createCtnEditableSourceFromDocument(
    previousSource,
    previousDocument,
  ).source;
  const previousEditableDocument = parseCtnEditableDocument(
    editableSource,
    previousSyntaxProfile,
  );
  const candidateDocument = parseCtnEditableDocument(
    editableSource,
    nextSyntaxProfile,
  );
  const change = { edits: [], source: editableSource };
  const assignedIds = assignExistingBlockIds({
    candidateDocument,
    change,
    previousDocument,
    previousEditableDocument,
    previousEditableSource: editableSource,
  });

  assignNewBlockIds({
    assignedIds,
    allocateId,
    candidateDocument,
  });

  const canonicalSource = insertCanonicalMetadataLines(
    editableSource,
    candidateDocument,
    createMetadataByCandidateBlock({
      assignedIds,
      candidateDocument,
      previousDocument,
      timestamp,
      touchTitle: hasCanonicalStructureChanged({
        assignedIds,
        candidateDocument,
        previousDocument,
      }),
    }),
  );

  parseCtnCanonicalDocument(canonicalSource, nextSyntaxProfile);
  return canonicalSource;
}
