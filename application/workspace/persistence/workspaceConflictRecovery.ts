// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnCanonicalSourceAnalysis } from "../../../core/ctn/analysis/sourceAnalysis.ts";
import { initializeCtnSourceBlockMetadataAnalysis } from "../../../core/ctn/metadata/sourceMetadata.ts";
import { appendNoteToWorkspaceTree } from "../../../core/workspace/model/noteTree/mutations.ts";
import {
  createCanonicalNoteSource,
  createNoteRecord,
  type NoteId,
} from "../../../core/workspace/model/workspaceData.ts";
import type { PreparedVersionedContent } from "../../persistence/versionedRepository.ts";
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
  return unitIds.flatMap((unitId) =>
    unitId.startsWith("workspace:note:")
      ? [unitId.slice("workspace:note:".length)]
      : []
  );
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
  let next = selected.content;
  const analysisOverrides = new Map<NoteId, CtnCanonicalSourceAnalysis>();
  const noteIds = new Set(selected.projection.workspace.noteEntryById.keys());
  const reservedBlockIds = new Set(
    selected.projection.analysisIndex?.blockIds ?? [],
  );
  const syntax = selected.projection.workspaceSyntax?.syntax;
  let recovered = 0;

  for (const sourceNoteId of workspaceConflictNoteIds(conflict.unitIds)) {
    const parsed = local.analysisIndex?.getParsedNote(sourceNoteId);
    const localEntry = local.workspace.noteEntryById.get(sourceNoteId);

    if (!localEntry) continue;
    const sourceEntry = selected.projection.workspace.noteEntryById.get(
      sourceNoteId,
    ) ?? localEntry;
    const parentFolderId = sourceEntry.parentFolderId &&
        selected.projection.workspace.folderEntryById.has(
          sourceEntry.parentFolderId,
        )
      ? sourceEntry.parentFolderId
      : null;
    const editable = parsed?.analysis.editableProjection.source ??
      localEntry.note.source.split("\n").slice(1).join("\n");
    const separator = editable.indexOf("\n");
    const body = separator < 0 ? "" : editable.slice(separator + 1);
    const recoverySource = body ? `本地恢复副本\n${body}` : "本地恢复副本";
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
        title: "本地恢复副本",
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
  if (recovered === 0) {
    throw new Error("当前冲突不包含可另存的本地正文。");
  }
  return {
    content: next,
    projection: prepareWorkspaceRepositoryContent(next, {
      analysisOverrides,
      previous: selected.projection,
    }),
  };
}
