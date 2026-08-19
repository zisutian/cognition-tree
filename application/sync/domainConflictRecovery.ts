// SPDX-License-Identifier: GPL-3.0-or-later

import {
  initializeCtnSourceBlockMetadataAnalysis,
} from "../../core/ctn/metadata/sourceMetadata.ts";
import {
  createMyersTextEdits,
} from "../../core/ctn/metadata/myersTextEdits.ts";
import type {
  CtnCanonicalSourceAnalysis,
} from "../../core/ctn/analysis/sourceAnalysis.ts";
import {
  createJournalEntry,
  updateJournalEntryBody,
} from "../../core/journal/commands/journalCommands.ts";
import {
  createJournalParseIndex,
  type JournalParseIndex,
} from "../../core/journal/indexes/journalParseIndex.ts";
import {
  type JournalContent,
  type JournalEntryId,
} from "../../core/journal/model/journalContent.ts";
import {
  createJournalEntryBodyProjection,
} from "../../core/journal/model/journalEntryProjection.ts";
import {
  createPortableNameKey,
} from "../../core/naming/portableName.ts";
import {
  createTodoCollection,
  updateTodoCollectionBody,
} from "../../core/todo/commands/todoCollectionCommands.ts";
import {
  createTodoParseIndex,
  type TodoParseIndex,
} from "../../core/todo/indexes/todoParseIndex.ts";
import {
  type TodoCollectionId,
  type TodoContent,
} from "../../core/todo/model/todoContent.ts";
import {
  createTodoCollectionBodyProjection,
} from "../../core/todo/model/todoCollectionProjection.ts";
import {
  appendNoteToWorkspaceTree,
} from "../../core/workspace/model/noteTree/mutations.ts";
import {
  createNoteRecord,
  createCanonicalNoteSource,
  type NoteId,
} from "../../core/workspace/model/workspaceData.ts";
import type {
  WorkspaceRepositoryContent,
} from "../repository/workspaceRepository.ts";
import type {
  PreparedVersionedContent,
} from "../persistence/versionedRepository.ts";
import {
  prepareWorkspaceRepositoryContent,
  type WorkspaceRepositoryPreparation,
} from "../repository/workspaceRepositoryPreparation.ts";

type RecoverableConflict = Readonly<{ unitIds: readonly string[] }>;

type SharedConflictRecoveryDependencies = {
  createBlockId(): string;
  now(): string;
};

export type WorkspaceConflictRecoveryDependencies =
  SharedConflictRecoveryDependencies & {
    createWorkspaceNoteId(): NoteId;
  };

export type JournalConflictRecoveryDependencies =
  SharedConflictRecoveryDependencies & {
  createJournalEntryId(): JournalEntryId;
  timezoneOffsetMinutes(): number;
};

export type TodoConflictRecoveryDependencies =
  SharedConflictRecoveryDependencies & {
  createTodoCollectionId(): TodoCollectionId;
};

function requireRecoveryCount(count: number) {
  if (count === 0) {
    throw new Error("当前冲突不包含可另存的本地正文。");
  }
}

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
  conflict: RecoverableConflict,
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
    ) ??
      localEntry;
    const parentFolderId = sourceEntry?.parentFolderId &&
        selected.projection.workspace.folderEntryById.has(
          sourceEntry.parentFolderId,
        )
      ? sourceEntry.parentFolderId
      : null;
    const editable = parsed?.analysis.editableProjection.source ??
      localEntry.note.source.split("\n").slice(1).join("\n");
    const separator = editable.indexOf("\n");
    const body = separator < 0 ? "" : editable.slice(separator + 1);
    const recoverySource = body
      ? `本地恢复副本\n${body}`
      : "本地恢复副本";
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
        notes: [
          ...next.workspace.notes,
          createNoteRecord(noteId, source),
        ],
        tree: appendNoteToWorkspaceTree(
          next.workspace.tree,
          noteId,
          parentFolderId,
        ),
      },
    };
    recovered += 1;
  }
  requireRecoveryCount(recovered);
  return {
    content: next,
    projection: prepareWorkspaceRepositoryContent(next, {
      analysisOverrides,
      previous: selected.projection,
    }),
  };
}

function journalConflictEntryIds(unitIds: readonly string[]) {
  return unitIds.flatMap((unitId) =>
    unitId.startsWith("journal:entry:")
      ? [unitId.slice("journal:entry:".length) as JournalEntryId]
      : []
  );
}

export function recoverJournalLocalConflictCopies(
  selected: PreparedVersionedContent<JournalContent, JournalParseIndex>,
  conflict: RecoverableConflict,
  dependencies: JournalConflictRecoveryDependencies,
  localPrepared: PreparedVersionedContent<JournalContent, JournalParseIndex>,
) {
  const localIndex = localPrepared.projection;
  let next = selected.content;
  let currentIndex = selected.projection;
  let recovered = 0;

  for (const sourceEntryId of journalConflictEntryIds(conflict.unitIds)) {
    const localEntry = localIndex.getParsedEntry(sourceEntryId);

    if (!localEntry) continue;
    const body = createJournalEntryBodyProjection(localEntry).source;
    const timestamp = dependencies.now();
    const entryId = dependencies.createJournalEntryId();
    const created = createJournalEntry(next, currentIndex, {
      createBlockId: dependencies.createBlockId,
      createdAt: timestamp,
      entryId,
      timezoneOffsetMinutes: dependencies.timezoneOffsetMinutes(),
    });
    const createdIndex = createJournalParseIndex(
      created.content,
      currentIndex,
      new Map([[entryId, created.analysis]]),
    );

    const updated = updateJournalEntryBody(created.content, createdIndex, {
      change: {
        edits: createMyersTextEdits("", body),
        source: body,
      },
      createBlockId: dependencies.createBlockId,
      entryId,
      updatedAt: timestamp,
    });

    next = updated.content;
    currentIndex = createJournalParseIndex(
      next,
      createdIndex,
      new Map([[entryId, updated.analysis]]),
    );
    recovered += 1;
  }
  requireRecoveryCount(recovered);
  return { content: next, projection: currentIndex };
}

function todoConflictCollectionIds(unitIds: readonly string[]) {
  const prefix = "todo:collection:";

  return unitIds.flatMap((unitId) => {
    if (!unitId.startsWith(prefix)) return [];
    const collectionId = unitId.slice(prefix.length).replace(/:body$/, "");

    return [collectionId as TodoCollectionId];
  });
}

function createRecoveryCollectionName(index: TodoParseIndex) {
  const names = new Set(
    index.collections.map(({ name }) =>
      createPortableNameKey(name)
    ),
  );

  for (let index = 1; index <= 10_000; index += 1) {
    const candidate = `本地恢复副本 ${index}`;

    if (!names.has(createPortableNameKey(candidate))) return candidate;
  }
  throw new Error("无法为 Todo 恢复副本生成唯一名称。");
}

export function recoverTodoLocalConflictCopies(
  selected: PreparedVersionedContent<TodoContent, TodoParseIndex>,
  conflict: RecoverableConflict,
  dependencies: TodoConflictRecoveryDependencies,
  localPrepared: PreparedVersionedContent<TodoContent, TodoParseIndex>,
) {
  const localIndex = localPrepared.projection;
  let next = selected.content;
  let currentIndex = selected.projection;
  let recovered = 0;

  for (
    const sourceCollectionId of todoConflictCollectionIds(conflict.unitIds)
  ) {
    const localCollection = localIndex.getParsedCollection(sourceCollectionId);

    if (!localCollection) continue;
    const body = createTodoCollectionBodyProjection(localCollection).source;
    const timestamp = dependencies.now();
    const collectionId = dependencies.createTodoCollectionId();
    const created = createTodoCollection(next, currentIndex, {
      collectionId,
      createBlockId: dependencies.createBlockId,
      createdAt: timestamp,
      name: createRecoveryCollectionName(currentIndex),
    });
    const createdIndex = createTodoParseIndex(
      created.content,
      currentIndex,
      new Map([[collectionId, created.analysis]]),
    );

    const updated = updateTodoCollectionBody(created.content, createdIndex, {
      change: {
        edits: createMyersTextEdits("", body),
        source: body,
      },
      collectionId,
      createBlockId: dependencies.createBlockId,
      updatedAt: timestamp,
    });
    next = updated.content;
    currentIndex = createTodoParseIndex(
      next,
      createdIndex,
      new Map([[collectionId, updated.analysis]]),
    );
    recovered += 1;
  }
  requireRecoveryCount(recovered);
  return { content: next, projection: currentIndex };
}
