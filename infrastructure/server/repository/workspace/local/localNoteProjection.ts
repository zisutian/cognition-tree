// SPDX-License-Identifier: GPL-3.0-or-later

import {
  analyzeCtnSource,
  type CtnCanonicalSourceAnalysis,
} from "../../../../../core/ctn/analysis/sourceAnalysis.ts";
import { createCtnBlockIdAllocator } from "../../../../../core/ctn/metadata/blockIdAllocator.ts";
import { formatCtnBlockMetadataLine } from "../../../../../core/ctn/metadata/blockMetadata.ts";
import { createMyersTextEdits } from "../../../../../core/ctn/metadata/myersTextEdits.ts";
import { reconcileCtnSourceBlockMetadata } from "../../../../../core/ctn/metadata/reconcileSourceMetadata.ts";
import {
  initializeCtnSourceBlockMetadataAnalysis,
} from "../../../../../core/ctn/metadata/sourceMetadata.ts";
import {
  readCtnCanonicalTitleHeader,
} from "../../../../../core/ctn/parser/parseCtnDocument.ts";
import { compileCtnSyntaxSource } from "../../../../../core/ctn/syntax/compiler.ts";
import type { CtnCompiledSyntax } from "../../../../../core/ctn/syntax/types.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
} from "../../store.ts";
import type { LocalNoteMetadata } from "./localWorkingTreeLayout.ts";

function resolveSyntax(
  syntaxSource: string | null,
): CtnCompiledSyntax | null {
  if (syntaxSource === null) return null;
  const result = compileCtnSyntaxSource(syntaxSource, "workspace");

  if (!result.syntax) {
    throw new RepositoryCorruptError(
      "Local workspace syntax is invalid",
    );
  }
  return result.syntax;
}

export function createLocalNoteMetadataFromAnalysis(
  noteId: string,
  analysis: CtnCanonicalSourceAnalysis,
): LocalNoteMetadata {
  const { document, editableProjection: editable } = analysis;

  return {
    blocks: document.blocks.map((block) => ({
      createdAt: block.metadata.createdAt,
      editableLineNumber:
        editable.editableLineNumberByCanonicalLineNumber.get(
          block.metadataLineNumber,
        ) ?? 1,
      fingerprint: block.contentFingerprint,
      id: block.id,
      indentText: block.indentText,
      updatedAt: block.metadata.updatedAt,
    })),
    editableSource: editable.source,
    noteId,
    schemaVersion: 1,
  };
}

export type LocalCanonicalNoteProjection = {
  analysis: CtnCanonicalSourceAnalysis | null;
  metadata: LocalNoteMetadata;
};

export function projectCanonicalNoteSourceAnalysis(
  noteId: string,
  canonicalSource: string,
  syntaxSource: string | null,
  preparedSyntax?: CtnCompiledSyntax | null,
): LocalCanonicalNoteProjection {
  try {
    const syntax = preparedSyntax === undefined
      ? resolveSyntax(syntaxSource)
      : preparedSyntax;

    if (syntax === null) {
      const header = readCtnCanonicalTitleHeader(canonicalSource);
      const editableSource = canonicalSource.split("\n").slice(1).join("\n");

      return {
        analysis: null,
        metadata: {
          blocks: [{
            ...header.metadata,
            editableLineNumber: 1,
            fingerprint: editableSource.split("\n", 1)[0] ?? "",
          }],
          editableSource,
          noteId,
          schemaVersion: 1,
        },
      };
    }
    const analysis = analyzeCtnSource({
      mode: { kind: "canonical-document" },
      source: canonicalSource,
      syntax,
    });

    return {
      analysis,
      metadata: createLocalNoteMetadataFromAnalysis(noteId, analysis),
    };
  } catch (error) {
    if (error instanceof RepositoryCorruptError) throw error;
    throw new RepositoryCorruptError(
      `Canonical metadata is invalid for note ${noteId}`,
    );
  }
}

export function projectCanonicalNoteSource(
  noteId: string,
  canonicalSource: string,
  syntaxSource: string | null,
  preparedSyntax?: CtnCompiledSyntax | null,
): LocalNoteMetadata {
  return projectCanonicalNoteSourceAnalysis(
    noteId,
    canonicalSource,
    syntaxSource,
    preparedSyntax,
  ).metadata;
}

export function createCanonicalSourceFromLocalNoteMetadata(
  sidecar: LocalNoteMetadata,
) {
  const lines = sidecar.editableSource.split("\n");
  const blocks = [...sidecar.blocks].sort(
    (left, right) => right.editableLineNumber - left.editableLineNumber,
  );

  for (const block of blocks) {
    lines.splice(
      block.editableLineNumber - 1,
      0,
      formatCtnBlockMetadataLine(block),
    );
  }
  return lines.join("\n");
}

export function equalLocalNoteMetadataProjection(
  left: LocalNoteMetadata,
  right: LocalNoteMetadata,
) {
  return left.editableSource === right.editableSource &&
    left.blocks.length === right.blocks.length &&
    left.blocks.every((block, index) => {
      const other = right.blocks[index];

      return other !== undefined &&
        block.createdAt === other.createdAt &&
        block.editableLineNumber === other.editableLineNumber &&
        block.fingerprint === other.fingerprint &&
        block.id === other.id &&
        block.indentText === other.indentText &&
        block.updatedAt === other.updatedAt;
    });
}

export function reconcileEditableNoteSourceAnalysis({
  createId,
  editableSource,
  noteId,
  previous,
  verifiedPrevious = null,
  reservedIds,
  syntaxSource,
  timestamp,
  syntax: preparedSyntax,
}: {
  createId: () => string;
  editableSource: string;
  noteId: string;
  previous: LocalNoteMetadata | null;
  verifiedPrevious?: LocalCanonicalNoteProjection | null;
  reservedIds: Set<string>;
  syntaxSource: string | null;
  timestamp: string;
  syntax?: CtnCompiledSyntax | null;
}): LocalCanonicalNoteProjection {
  if (previous) {
    verifiedPrevious ??= projectCanonicalNoteSourceAnalysis(
      noteId,
      createCanonicalSourceFromLocalNoteMetadata(previous),
      syntaxSource,
      preparedSyntax,
    );

    if (!equalLocalNoteMetadataProjection(verifiedPrevious.metadata, previous)) {
      throw new RepositoryCorruptError(
        `Note sidecar projection is invalid for ${noteId}`,
      );
    }
  }
  if (previous?.editableSource === editableSource) {
    previous.blocks.forEach((block) => reservedIds.add(block.id));
    return {
      analysis: verifiedPrevious?.analysis ?? null,
      metadata: previous,
    };
  }
  try {
    const syntax = preparedSyntax === undefined
      ? resolveSyntax(syntaxSource)
      : preparedSyntax;
    let canonicalSource: string;
    let canonicalAnalysis: CtnCanonicalSourceAnalysis | null = null;
    const previousCanonicalSource = previous
      ? createCanonicalSourceFromLocalNoteMetadata(previous)
      : null;

    if (syntax === null) {
      const allocator = createCtnBlockIdAllocator(createId, reservedIds);
      const metadata = previous
        ? readCtnCanonicalTitleHeader(previousCanonicalSource ?? "").metadata
        : {
            createdAt: timestamp,
            id: allocator.allocate(),
            indentText: "",
            updatedAt: timestamp,
          };

      canonicalSource = `${formatCtnBlockMetadataLine({
        ...metadata,
        updatedAt: timestamp,
      })}\n${editableSource}`;
    } else if (previous) {
      const previousAnalysis = verifiedPrevious?.analysis ?? analyzeCtnSource({
          mode: { kind: "canonical-document" },
          source: previousCanonicalSource ?? "",
          syntax,
        });
      const candidateAnalysis = analyzeCtnSource({
        mode: { kind: "editable-document" },
        source: editableSource,
        syntax,
      });

      const reconciled = reconcileCtnSourceBlockMetadata(
        previousAnalysis,
        candidateAnalysis,
        {
          edits: createMyersTextEdits(previous.editableSource, editableSource),
          source: editableSource,
        },
        {
          createId,
          reservedIds,
          timestamp,
          touchTitle: true,
        },
      );

      canonicalSource = reconciled.source;
      canonicalAnalysis = reconciled.analysis;
    } else {
      const initialized = initializeCtnSourceBlockMetadataAnalysis(
        editableSource,
        syntax,
        {
          createId,
          createdAt: timestamp,
          reservedIds,
          updatedAt: timestamp,
        },
      );

      canonicalSource = initialized.source;
      canonicalAnalysis = initialized.analysis;
    }
    const projected = canonicalAnalysis
      ? createLocalNoteMetadataFromAnalysis(noteId, canonicalAnalysis)
      : projectCanonicalNoteSource(
          noteId,
          canonicalSource,
          syntaxSource,
        );

    projected.blocks.forEach((block) => reservedIds.add(block.id));
    return { analysis: canonicalAnalysis, metadata: projected };
  } catch (error) {
    if (
      error instanceof RepositoryAdapterError ||
      error instanceof RepositoryCorruptError
    ) {
      throw error;
    }
    throw new RepositoryCorruptError(`Could not reconcile Local note ${noteId}`);
  }
}

export function reconcileEditableNoteSource(
  input: Parameters<typeof reconcileEditableNoteSourceAnalysis>[0],
): LocalNoteMetadata {
  return reconcileEditableNoteSourceAnalysis(input).metadata;
}
