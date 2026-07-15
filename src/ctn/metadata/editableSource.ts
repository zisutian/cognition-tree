import { findClosingMultilineFenceLineNumber } from "../parser/blockRanges";
import { parseMarker, sortMarkerRules } from "../parser/lineMarkers";
import type { CtnSyntaxProfile } from "../syntax/types";
import {
  ctnBlockMetadataDirective,
  parseCtnBlockMetadataLine,
  type CtnBlockMetadataRecord,
} from "./blockMetadata";

export type CtnEditableSource = {
  editableLineNumberByCanonicalLineNumber: ReadonlyMap<number, number>;
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

export function createCtnEditableSource(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
): CtnEditableSource {
  const lines = source.split("\n");
  const markerRules = sortMarkerRules(syntaxProfile.markerRules);
  const editableLineNumberByCanonicalLineNumber = new Map<number, number>();
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

  const appendSourceLine = (line: string, canonicalLineIndex: number) => {
    sourceLines.push(line);
    editableLineNumberByCanonicalLineNumber.set(
      canonicalLineIndex + 1,
      sourceLines.length,
    );
  };

  while (index < lines.length) {
    const line = lines[index];

    if (line.trimStart().startsWith(ctnBlockMetadataDirective)) {
      editableLineNumberByCanonicalLineNumber.set(index + 1, sourceLines.length + 1);
      candidateMetadata = {
        physicalLineIndex: index,
        record: readCandidateMetadata(line),
      };
      index += 1;
      continue;
    }

    appendSourceLine(line, index);
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

    for (
      let contentIndex = index + 1;
      contentIndex < closingLineNumber;
      contentIndex += 1
    ) {
      appendSourceLine(lines[contentIndex], contentIndex);
    }
    index = closingLineNumber;
  }

  const editableLineCount = Math.max(1, sourceLines.length);

  editableLineNumberByCanonicalLineNumber.forEach(
    (lineNumber, canonicalLineNumber) => {
      editableLineNumberByCanonicalLineNumber.set(
        canonicalLineNumber,
        Math.min(lineNumber, editableLineCount),
      );
    },
  );

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
