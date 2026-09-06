// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnCanonicalSourceAnalysis } from "../../../core/ctn/index.ts";
import { initializeCtnSourceBlockMetadataAnalysis } from "../../../core/ctn/index.ts";
import {
  appendNoteToWorkspaceTree,
  createCanonicalNoteSource,
  createNoteRecord,
  type NoteId,
} from "../../../core/workspace/index.ts";

import type { PreparedVersionedContent } from "../../persistence/index.ts";
import type {
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation,
} from "./workspaceRepository.ts";
import { prepareWorkspaceRepositoryContent } from "./workspaceRepositoryPreparation.ts";

export type WorkspaceConflictRecoveryDependencies = {
  createBlockId(): string;
  createWorkspaceNoteId(): NoteId;
  now(): string;
};

function workspaceConflictNoteIds(unitIds: readonly string[]) {
  return unitIds.map((unitId) => {
    const prefix = "workspace:note:";
    const noteId = unitId.startsWith(prefix) ? unitId.slice(prefix.length) : "";

    if (!noteId) {
      throw new Error(`当前冲突单元无法无损另存：${unitId}`);
    }
    return noteId;
  });
}

export function recoverWorkspaceLocalConflictCopies(
  selected: PreparedVersionedContent<
    WorkspaceRepositoryContent,
    WorkspaceRepositoryPreparation
  >,
  conflict: Readonly<{ unitIds: readonly string[] }>,
  dependencies: WorkspaceConflictRecoveryDependencies,
  localPrepared: PreparedVersionedContent<
    WorkspaceRepositoryContent,
    WorkspaceRepositoryPreparation
  >,
) {
  const local = localPrepared.projection;
  const recoverableNotes = workspaceConflictNoteIds(conflict.unitIds).map(
    (sourceNoteId) => {
      const localEntry = local.workspace.noteEntryById.get(sourceNoteId);
      const parsed = local.analysisIndex?.getParsedNote(sourceNoteId);

      if (!localEntry || !parsed) {
        throw new Error(`本地冲突笔记不可用于另存：${sourceNoteId}`);
      }
      return {
        localEntry,
        parsed,
        sourceNoteId,
      };
    },
  );
  let next = selected.content;
  const analysisOverrides = new Map<NoteId, CtnCanonicalSourceAnalysis>();
  const noteIds = new Set(selected.projection.workspace.noteEntryById.keys());
  const reservedBlockIds = new Set(
    selected.projection.analysisIndex?.blockIds ?? [],
  );
  const syntax = selected.projection.workspaceSyntax?.syntax;
  let recovered = 0;

  for (const { localEntry, parsed, sourceNoteId } of recoverableNotes) {
    const sourceEntry = selected.projection.workspace.noteEntryById.get(
      sourceNoteId,
    ) ?? localEntry;
    const parentFolderId = sourceEntry.parentFolderId &&
        selected.projection.workspace.folderEntryById.has(
          sourceEntry.parentFolderId,
        )
      ? sourceEntry.parentFolderId
      : null;
    const editable = parsed.analysis.editableProjection.source;
    const separator = editable.indexOf("\n");
    const localTitle = separator < 0 ? editable : editable.slice(0, separator);
    const body = separator < 0 ? "" : editable.slice(separator + 1);
    const recoveryTitle = localTitle
      ? `${localTitle} 本地恢复副本`
      : "本地恢复副本";
    const recoverySource = body ? `${recoveryTitle}\n${body}` : recoveryTitle;
    const timestamp = dependencies.now();
    const initialized = syntax && selected.projection.analysisIndex
      ? initializeCtnSourceBlockMetadataAnalysis(
          recoverySource,
          syntax,
          {
            createId: dependencies.createBlockId,
            createdAt: timestamp,
            reservedIds: reservedBlockIds,
            updatedAt: timestamp,
          },
        )
      : null;
    const fallbackBlockId = initialized ? null : dependencies.createBlockId();
    const source = initialized?.source ?? `${
      createCanonicalNoteSource({
        blockId: fallbackBlockId!,
        timestamp,
        title: recoveryTitle,
      })
    }${body ? `\n${body}` : ""}`;
    const noteId = dependencies.createWorkspaceNoteId();

    if (noteIds.has(noteId)) {
      throw new Error(`恢复笔记 ID 已存在：${noteId}`);
    }
    noteIds.add(noteId);
    if (initialized) {
      analysisOverrides.set(noteId, initialized.analysis);
      initialized.analysis.document.blocks.forEach(({ id }) =>
        reservedBlockIds.add(id)
      );
    } else {
      reservedBlockIds.add(fallbackBlockId!);
    }
    next = {
      ...next,
      workspace: {
        ...next.workspace,
        notes: [...next.workspace.notes, createNoteRecord(noteId, source)],
        tree: appendNoteToWorkspaceTree(
          next.workspace.tree,
          noteId,
          parentFolderId,
        ),
      },
    };
    recovered += 1;
  }
  if (recovered !== conflict.unitIds.length || recovered === 0) {
    throw new Error("当前冲突不包含可另存的本地正文。");
  }
  return {
    coveredUnitIds: [...conflict.unitIds],
    prepared: {
      content: next,
      projection: prepareWorkspaceRepositoryContent(next, {
        analysisOverrides,
        previous: selected.projection,
      }),
    },
  };
}
