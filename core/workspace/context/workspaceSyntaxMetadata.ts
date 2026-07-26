// SPDX-License-Identifier: GPL-3.0-or-later

import { analyzeCtnSource } from "../../ctn/analysis/sourceAnalysis";
import type {
  CtnCanonicalSourceAnalysis,
} from "../../ctn/analysis/sourceAnalysis";
import { createCtnBlockIdAllocator } from "../../ctn/metadata/blockIdAllocator";
import { formatCtnBlockMetadataLine } from "../../ctn/metadata/blockMetadata";
import {
  recanonicalizeCtnSourceBlockMetadata,
} from "../../ctn/metadata/reconcileSourceMetadata";
import {
  initializeCtnRawSourceBlockMetadataAnalysis,
} from "../../ctn/metadata/sourceMetadata";
import { readCtnCanonicalTitleHeader } from "../../ctn/parser/parseCtnDocument";
import type { CtnCompiledSyntax } from "../../ctn/syntax/types";
import type { WorkspaceParseIndex } from "../indexes/workspaceParseIndex";
import {
  replaceWorkspaceNoteSources,
  type NoteId,
  type WorkspaceData,
} from "../model/workspaceData";

export type WorkspaceSyntaxMetadataReconciliation = {
  analysisOverrides: ReadonlyMap<NoteId, CtnCanonicalSourceAnalysis>;
  workspaceData: WorkspaceData;
};

function emptyOverrides() {
  return new Map<NoteId, CtnCanonicalSourceAnalysis>();
}

function requireCurrentAnalysis(
  index: WorkspaceParseIndex | null,
  noteId: NoteId,
  source: string,
) {
  const parsed = index?.getParsedNote(noteId);

  if (!parsed || parsed.note.source !== source) {
    throw new Error(`Workspace note analysis is stale: ${noteId}`);
  }
  return parsed.analysis;
}

export function reconcileWorkspaceSyntaxBlockMetadata(
  workspaceData: WorkspaceData,
  previousIndex: WorkspaceParseIndex | null,
  nextSyntax: CtnCompiledSyntax | null,
  {
    createBlockId,
    timestamp,
  }: {
    createBlockId: () => string;
    timestamp: string;
  },
): WorkspaceSyntaxMetadataReconciliation {
  const previousSyntax = previousIndex?.syntax ?? null;

  if (!nextSyntax) {
    if (!previousSyntax) {
      return {
        analysisOverrides: emptyOverrides(),
        workspaceData,
      };
    }
    const workspace = replaceWorkspaceNoteSources(
      workspaceData,
      workspaceData.notes.map((note) => {
        const { metadata } = readCtnCanonicalTitleHeader(note.source);
        const analysis = requireCurrentAnalysis(
          previousIndex,
          note.id,
          note.source,
        );

        return {
          noteId: note.id,
          source:
            `${formatCtnBlockMetadataLine(metadata)}\n${
              analysis.editableProjection.source
            }`,
        };
      }),
    );

    return {
      analysisOverrides: emptyOverrides(),
      workspaceData: workspace,
    };
  }

  if (
    previousSyntax &&
    previousSyntax.blockGrammarKey === nextSyntax.blockGrammarKey
  ) {
    return {
      analysisOverrides: emptyOverrides(),
      workspaceData,
    };
  }
  const reservedIds = previousIndex?.blockIds ?? new Set(
    workspaceData.notes.map(
      (note) => readCtnCanonicalTitleHeader(note.source).metadata.id,
    ),
  );
  const allocator = createCtnBlockIdAllocator(createBlockId, reservedIds);
  const analysisOverrides =
    new Map<NoteId, CtnCanonicalSourceAnalysis>();
  const workspace = replaceWorkspaceNoteSources(
    workspaceData,
    workspaceData.notes.map((note) => {
      if (!previousSyntax) {
        const initialized = initializeCtnRawSourceBlockMetadataAnalysis(
          note.source,
          nextSyntax,
          {
            allocateId: allocator.allocate,
            timestamp,
          },
        );

        analysisOverrides.set(note.id, initialized.analysis);
        return { noteId: note.id, source: initialized.source };
      }
      const previousAnalysis = requireCurrentAnalysis(
        previousIndex,
        note.id,
        note.source,
      );
      const candidateAnalysis = analyzeCtnSource({
        mode: { kind: "editable-document" },
        source: previousAnalysis.editableProjection.source,
        syntax: nextSyntax,
      });
      const reconciled = recanonicalizeCtnSourceBlockMetadata(
        previousAnalysis,
        candidateAnalysis,
        {
          allocateId: allocator.allocate,
          timestamp,
          touchTitle: true,
        },
      );

      analysisOverrides.set(note.id, reconciled.analysis);
      return { noteId: note.id, source: reconciled.source };
    }),
  );

  return {
    analysisOverrides,
    workspaceData: workspace,
  };
}
