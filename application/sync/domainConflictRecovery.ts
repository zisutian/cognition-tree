// SPDX-License-Identifier: GPL-3.0-or-later

import {
  initializeCtnSourceBlockMetadataAnalysis,
} from "../../core/ctn/metadata/sourceMetadata.ts";
import {
  createMyersTextEdits,
} from "../../core/ctn/metadata/myersTextEdits.ts";
import {
  createJournalEntry,
  updateJournalEntryBody,
} from "../../core/journal/commands/journalCommands.ts";
import {
  createJournalParseIndex,
} from "../../core/journal/indexes/journalParseIndex.ts";
import {
  createJournalEntryBodyProjection,
  type JournalContent,
  type JournalEntryId,
} from "../../core/journal/model/journalContent.ts";
import {
  createPortableNameKey,
} from "../../core/naming/portableName.ts";
import {
  createTodoCollection,
  updateTodoCollectionBody,
} from "../../core/todo/commands/todoCommands.ts";
import {
  createTodoParseIndex,
} from "../../core/todo/indexes/todoParseIndex.ts";
import {
  createTodoCollectionBodyProjection,
  type TodoCollectionId,
  type TodoContent,
} from "../../core/todo/model/todoContent.ts";
import {
  createWorkspaceStructureIndex,
} from "../../core/workspace/indexes/workspaceStructureIndex.ts";
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
import {
  resolveWorkspaceSessionContent,
} from "../workspace/session/sessionRepositorySnapshot.ts";
import type {
  VersionedRepositoryConflictRecord,
} from "../persistence/versionedRepository.ts";

type RecoverableConflict<Content> = Pick<
  VersionedRepositoryConflictRecord<Content, string>,
  "local" | "unitIds"
>;

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
  selected: WorkspaceRepositoryContent,
  conflict: RecoverableConflict<WorkspaceRepositoryContent>,
  dependencies: WorkspaceConflictRecoveryDependencies,
) {
  const local = resolveWorkspaceSessionContent(conflict.local);
  let next = selected;
  let recovered = 0;

  for (const sourceNoteId of workspaceConflictNoteIds(conflict.unitIds)) {
    const parsed = local.analysisIndex?.getParsedNote(sourceNoteId);
    const localEntry = local.workspace.noteEntryById.get(sourceNoteId);

    if (!localEntry) continue;
    const current = resolveWorkspaceSessionContent(next);
    const syntax = current.workspaceSyntax?.syntax;

    const sourceEntry = current.workspace.noteEntryById.get(sourceNoteId) ??
      localEntry;
    const parentFolderId = sourceEntry?.parentFolderId &&
        current.workspace.folderEntryById.has(sourceEntry.parentFolderId)
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
    const source = syntax && current.analysisIndex
      ? initializeCtnSourceBlockMetadataAnalysis(
          recoverySource,
          syntax,
          {
            createId: dependencies.createBlockId,
            createdAt: timestamp,
            reservedIds: current.analysisIndex.blockIds,
            updatedAt: timestamp,
          },
        ).source
      : `${
        createCanonicalNoteSource({
          blockId: dependencies.createBlockId(),
          timestamp,
          title: "本地恢复副本",
        })
      }${body ? `\n${body}` : ""}`;
    const noteId = dependencies.createWorkspaceNoteId();

    if (current.workspace.noteEntryById.has(noteId)) {
      throw new Error(`恢复笔记 ID 已存在：${noteId}`);
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
  createWorkspaceStructureIndex(next.workspace);
  return next;
}

function journalConflictEntryIds(unitIds: readonly string[]) {
  return unitIds.flatMap((unitId) =>
    unitId.startsWith("journal:entry:")
      ? [unitId.slice("journal:entry:".length) as JournalEntryId]
      : []
  );
}

export function recoverJournalLocalConflictCopies(
  selected: JournalContent,
  conflict: RecoverableConflict<JournalContent>,
  dependencies: JournalConflictRecoveryDependencies,
) {
  const localIndex = createJournalParseIndex(conflict.local);
  let next = selected;
  let recovered = 0;

  for (const sourceEntryId of journalConflictEntryIds(conflict.unitIds)) {
    const localEntry = localIndex.getParsedEntry(sourceEntryId);

    if (!localEntry) continue;
    const body = createJournalEntryBodyProjection(localEntry).source;
    const timestamp = dependencies.now();
    const currentIndex = createJournalParseIndex(next);
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

    next = updateJournalEntryBody(created.content, createdIndex, {
      change: {
        edits: createMyersTextEdits("", body),
        source: body,
      },
      createBlockId: dependencies.createBlockId,
      entryId,
      updatedAt: timestamp,
    }).content;
    recovered += 1;
  }
  requireRecoveryCount(recovered);
  return next;
}

function todoConflictCollectionIds(unitIds: readonly string[]) {
  const prefix = "todo:collection:";

  return unitIds.flatMap((unitId) => {
    if (!unitId.startsWith(prefix)) return [];
    const collectionId = unitId.slice(prefix.length).replace(/:body$/, "");

    return [collectionId as TodoCollectionId];
  });
}

function createRecoveryCollectionName(content: TodoContent) {
  const names = new Set(
    createTodoParseIndex(content).collections.map(({ name }) =>
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
  selected: TodoContent,
  conflict: RecoverableConflict<TodoContent>,
  dependencies: TodoConflictRecoveryDependencies,
) {
  const localIndex = createTodoParseIndex(conflict.local);
  let next = selected;
  let recovered = 0;

  for (
    const sourceCollectionId of todoConflictCollectionIds(conflict.unitIds)
  ) {
    const localCollection = localIndex.getParsedCollection(sourceCollectionId);

    if (!localCollection) continue;
    const body = createTodoCollectionBodyProjection(localCollection).source;
    const timestamp = dependencies.now();
    const currentIndex = createTodoParseIndex(next);
    const collectionId = dependencies.createTodoCollectionId();
    const created = createTodoCollection(next, currentIndex, {
      collectionId,
      createBlockId: dependencies.createBlockId,
      createdAt: timestamp,
      name: createRecoveryCollectionName(next),
    });
    const createdIndex = createTodoParseIndex(
      created.content,
      currentIndex,
      new Map([[collectionId, created.analysis]]),
    );

    next = updateTodoCollectionBody(created.content, createdIndex, {
      change: {
        edits: createMyersTextEdits("", body),
        source: body,
      },
      collectionId,
      createBlockId: dependencies.createBlockId,
      updatedAt: timestamp,
    }).content;
    recovered += 1;
  }
  requireRecoveryCount(recovered);
  return next;
}
