import {
  parseCtnDocument,
  parseCtnSourceWithSyntheticMetadata,
} from "../parser/parseCtnDocument";
import { findClosingMultilineFenceLineNumber } from "../parser/blockRanges";
import { parseMarker, sortMarkerRules } from "../parser/lineMarkers";
import type { CtnBlock, CtnDocument } from "../parser/types";
import type { CtnSyntaxProfile } from "../syntax/types";
import {
  ctnBlockMetadataDirective,
  formatCtnBlockMetadataLine,
  isCtnBlockId,
  parseCtnBlockMetadataLine,
  type CtnBlockMetadataRecord,
} from "./blockMetadata";

export type ReconcileCtnSourceBlockMetadataOptions = {
  createId?: () => string;
  reservedIds?: ReadonlySet<string>;
  timestamp: string;
};

type EditableSource = {
  metadataByLineNumber: ReadonlyMap<number, CtnBlockMetadataRecord | null>;
  source: string;
};

function readCandidateMetadata(line: string) {
  try {
    return parseCtnBlockMetadataLine(line);
  } catch {
    return null;
  }
}

function extractEditableSource(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
): EditableSource {
  const lines = source.split("\n");
  const markerRules = sortMarkerRules(syntaxProfile.markerRules);
  const metadataByLineNumber = new Map<
    number,
    CtnBlockMetadataRecord | null
  >();
  const sourceLines: string[] = [];
  let candidateMetadata:
    | { physicalLineIndex: number; record: CtnBlockMetadataRecord | null }
    | null = null;
  let hasTitleLine = false;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trimStart().startsWith(ctnBlockMetadataDirective)) {
      candidateMetadata = {
        physicalLineIndex: index,
        record: readCandidateMetadata(line),
      };
      index += 1;
      continue;
    }

    sourceLines.push(line);
    const sourceLineNumber = sourceLines.length;

    if (candidateMetadata?.physicalLineIndex === index - 1) {
      metadataByLineNumber.set(sourceLineNumber, candidateMetadata.record);
    }
    candidateMetadata = null;

    if (!hasTitleLine) {
      hasTitleLine = true;
      index += 1;
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const indentText = line.match(/^\s*/)?.[0] ?? "";
    const marker = parseMarker(
      line.trim(),
      sourceLineNumber,
      indentText.length,
      markerRules,
    );

    if (marker.role !== "multiline" || marker.marker === null) {
      index += 1;
      continue;
    }

    const closingLineNumber = findClosingMultilineFenceLineNumber(
      lines,
      index + 1,
      marker.marker,
    );

    for (let contentIndex = index + 1; contentIndex < closingLineNumber; contentIndex += 1) {
      sourceLines.push(lines[contentIndex]);
    }
    index = closingLineNumber;
  }

  return {
    metadataByLineNumber,
    source: sourceLines.join("\n"),
  };
}

function findNearestCandidateIndex({
  candidates,
  candidateBlocks,
  previousBlock,
  previousIndex,
}: {
  candidates: number[];
  candidateBlocks: CtnBlock[];
  previousBlock: CtnBlock;
  previousIndex: number;
}) {
  return candidates.reduce((bestIndex, candidateIndex) => {
    if (bestIndex === -1) {
      return candidateIndex;
    }

    const candidate = candidateBlocks[candidateIndex];
    const best = candidateBlocks[bestIndex];
    const candidateTextPenalty = candidate.rawText === previousBlock.rawText ? 0 : 1;
    const bestTextPenalty = best.rawText === previousBlock.rawText ? 0 : 1;

    if (candidateTextPenalty !== bestTextPenalty) {
      return candidateTextPenalty < bestTextPenalty ? candidateIndex : bestIndex;
    }

    return Math.abs(candidateIndex - previousIndex) <
      Math.abs(bestIndex - previousIndex)
      ? candidateIndex
      : bestIndex;
  }, -1);
}

function assignExistingBlockIds({
  candidateDocument,
  editableSource,
  previousDocument,
}: {
  candidateDocument: CtnDocument;
  editableSource: EditableSource;
  previousDocument: CtnDocument;
}) {
  const assignedIds = new Map<CtnBlock, string>();
  const assignedCandidateIndexes = new Set<number>();
  const assignedExistingIds = new Set<string>();
  const previousBlockById = new Map(
    previousDocument.blocks.map((block) => [block.id, block]),
  );
  const candidatesByMetadataId = new Map<string, number[]>();

  candidateDocument.blocks.forEach((block, index) => {
    const metadata = editableSource.metadataByLineNumber.get(block.lineNumber);

    if (!metadata || !previousBlockById.has(metadata.id)) {
      return;
    }

    const candidates = candidatesByMetadataId.get(metadata.id) ?? [];
    candidates.push(index);
    candidatesByMetadataId.set(metadata.id, candidates);
  });

  previousDocument.blocks.forEach((previousBlock, previousIndex) => {
    const candidates = candidatesByMetadataId.get(previousBlock.id) ?? [];
    const candidateIndex = findNearestCandidateIndex({
      candidates: candidates.filter(
        (index) => !assignedCandidateIndexes.has(index),
      ),
      candidateBlocks: candidateDocument.blocks,
      previousBlock,
      previousIndex,
    });

    if (candidateIndex < 0) {
      return;
    }

    assignedCandidateIndexes.add(candidateIndex);
    assignedIds.set(candidateDocument.blocks[candidateIndex], previousBlock.id);
    assignedExistingIds.add(previousBlock.id);
  });

  const fallbackCandidatesByRawText = new Map<
    string,
    { cursor: number; indexes: number[] }
  >();

  candidateDocument.blocks.forEach((candidate, index) => {
    const metadata = editableSource.metadataByLineNumber.get(
      candidate.lineNumber,
    );

    if (assignedCandidateIndexes.has(index) || metadata) {
      return;
    }

    const candidates = fallbackCandidatesByRawText.get(candidate.rawText) ?? {
      cursor: 0,
      indexes: [],
    };
    candidates.indexes.push(index);
    fallbackCandidatesByRawText.set(candidate.rawText, candidates);
  });

  previousDocument.blocks.forEach((previousBlock) => {
    if (assignedExistingIds.has(previousBlock.id)) {
      return;
    }

    const candidates = fallbackCandidatesByRawText.get(previousBlock.rawText);

    while (
      candidates &&
      assignedCandidateIndexes.has(candidates.indexes[candidates.cursor])
    ) {
      candidates.cursor += 1;
    }

    const candidateIndex = candidates?.indexes[candidates.cursor] ?? -1;

    if (candidateIndex < 0) {
      return;
    }

    if (candidates) {
      candidates.cursor += 1;
    }
    assignedCandidateIndexes.add(candidateIndex);
    assignedIds.set(candidateDocument.blocks[candidateIndex], previousBlock.id);
    assignedExistingIds.add(previousBlock.id);
  });

  return assignedIds;
}

function createUniqueBlockId(
  createId: () => string,
  usedIds: Set<string>,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = createId();

    if (!isCtnBlockId(id)) {
      throw new Error(`Invalid generated CTN block id: ${id}`);
    }

    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }

  throw new Error("Unable to generate a unique CTN block id.");
}

function assignNewBlockIds({
  assignedIds,
  candidateDocument,
  createId,
  reservedIds,
}: {
  assignedIds: Map<CtnBlock, string>;
  candidateDocument: CtnDocument;
  createId: () => string;
  reservedIds: ReadonlySet<string>;
}) {
  const usedIds = new Set(reservedIds);

  assignedIds.forEach((id) => usedIds.add(id));
  candidateDocument.blocks.forEach((block) => {
    if (!assignedIds.has(block)) {
      assignedIds.set(block, createUniqueBlockId(createId, usedIds));
    }
  });
}

function createParentIdMap(
  document: CtnDocument,
  resolveId: (block: CtnBlock) => string,
) {
  const parentIdById = new Map<string, string | null>();

  const visit = (block: CtnBlock, parentId: string | null) => {
    const id = resolveId(block);
    parentIdById.set(id, parentId);
    block.children.forEach((child) => visit(child, id));
  };

  document.roots.forEach((root) => visit(root, null));
  return parentIdById;
}

function findStableOrderIds(
  previousDocument: CtnDocument,
  candidateDocument: CtnDocument,
  assignedIds: ReadonlyMap<CtnBlock, string>,
) {
  const previousIndexById = new Map(
    previousDocument.blocks.map((block, index) => [block.id, index]),
  );
  const sequence = candidateDocument.blocks.flatMap((block) => {
    const id = assignedIds.get(block);
    const previousIndex = id ? previousIndexById.get(id) : undefined;

    return id && previousIndex !== undefined ? [{ id, previousIndex }] : [];
  });
  const tails: number[] = [];
  const tailSequenceIndexes: number[] = [];
  const precedingSequenceIndexes = new Array<number>(sequence.length).fill(-1);

  sequence.forEach((entry, sequenceIndex) => {
    let low = 0;
    let high = tails.length;

    while (low < high) {
      const middle = Math.floor((low + high) / 2);

      if (tails[middle] < entry.previousIndex) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    if (low > 0) {
      precedingSequenceIndexes[sequenceIndex] = tailSequenceIndexes[low - 1];
    }
    tails[low] = entry.previousIndex;
    tailSequenceIndexes[low] = sequenceIndex;
  });

  const stableIds = new Set<string>();
  let sequenceIndex = tailSequenceIndexes[tails.length - 1] ?? -1;

  while (sequenceIndex >= 0) {
    stableIds.add(sequence[sequenceIndex].id);
    sequenceIndex = precedingSequenceIndexes[sequenceIndex];
  }

  return stableIds;
}

function createMetadataByCandidateBlock({
  assignedIds,
  candidateDocument,
  previousDocument,
  timestamp,
}: {
  assignedIds: ReadonlyMap<CtnBlock, string>;
  candidateDocument: CtnDocument;
  previousDocument: CtnDocument;
  timestamp: string;
}) {
  const previousBlockById = new Map(
    previousDocument.blocks.map((block) => [block.id, block]),
  );
  const previousParentIdById = createParentIdMap(
    previousDocument,
    (block) => block.id,
  );
  const candidateParentIdById = createParentIdMap(
    candidateDocument,
    (block) => assignedIds.get(block) ?? block.id,
  );
  const stableOrderIds = findStableOrderIds(
    previousDocument,
    candidateDocument,
    assignedIds,
  );
  const metadataByBlock = new Map<CtnBlock, CtnBlockMetadataRecord>();

  candidateDocument.blocks.forEach((block) => {
    const id = assignedIds.get(block);

    if (!id) {
      throw new Error("CTN block metadata reconciliation left a block unassigned.");
    }

    const previousBlock = previousBlockById.get(id);
    const changed = previousBlock
      ? previousBlock.rawText !== block.rawText ||
        previousParentIdById.get(id) !== candidateParentIdById.get(id) ||
        !stableOrderIds.has(id)
      : true;

    metadataByBlock.set(block, {
      createdAt: previousBlock?.metadata.createdAt ?? timestamp,
      id,
      indentText: block.indentText,
      updatedAt: changed
        ? timestamp
        : previousBlock?.metadata.updatedAt ?? timestamp,
    });
  });

  return metadataByBlock;
}

function insertCanonicalMetadataLines(
  source: string,
  document: CtnDocument,
  metadataByBlock: ReadonlyMap<CtnBlock, CtnBlockMetadataRecord>,
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
  nextSource: string,
  syntaxProfile: CtnSyntaxProfile,
  {
    createId = () => globalThis.crypto.randomUUID(),
    reservedIds = new Set<string>(),
    timestamp,
  }: ReconcileCtnSourceBlockMetadataOptions,
) {
  if (previousSource === nextSource) {
    return previousSource;
  }

  const previousDocument = parseCtnDocument(previousSource, syntaxProfile);
  const editableSource = extractEditableSource(nextSource, syntaxProfile);
  const candidateDocument = parseCtnSourceWithSyntheticMetadata(
    editableSource.source,
    syntaxProfile,
  );
  const assignedIds = assignExistingBlockIds({
    candidateDocument,
    editableSource,
    previousDocument,
  });

  assignNewBlockIds({
    assignedIds,
    candidateDocument,
    createId,
    reservedIds,
  });

  return insertCanonicalMetadataLines(
    editableSource.source,
    candidateDocument,
    createMetadataByCandidateBlock({
      assignedIds,
      candidateDocument,
      previousDocument,
      timestamp,
    }),
  );
}
