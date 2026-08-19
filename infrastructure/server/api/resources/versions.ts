// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import type { ApiResourceVersionDto } from "../../../../contracts/api/types.ts";
import type { WorkspaceRepositoryContentDto } from "../../../../contracts/workspace/types.ts";
import type { JournalContent } from "../../../../core/journal/model/journalContent.ts";
import type { ParsedTodoIndexCollection } from "../../../../core/todo/indexes/todoParseIndex.ts";
import {
  type TodoContent,
} from "../../../../core/todo/model/todoContent.ts";
import {
  createTodoCollectionBodyProjection,
} from "../../../../core/todo/model/todoCollectionProjection.ts";
import type {
  WorkspaceResourceVersionPolicy,
} from "../../../../application/workspace/commands/workspaceCommandExecutor.ts";
import type {
  JournalDomainVersions,
} from "../../../../application/journal/journalDomainCommands.ts";
import type {
  TodoDomainVersions,
} from "../../../../application/todo/todoDomainCommands.ts";

export function createApiResourceVersion(
  value: unknown,
): ApiResourceVersionDto {
  return `sha256:${createHash("sha256")
    .update(serializeJsonIteratively(value, { sortObjectKeys: true }))
    .digest("hex")}`;
}

export function createWorkspaceTreeVersion(
  content: WorkspaceRepositoryContentDto,
) {
  return createApiResourceVersion({
    tree: content.workspace.tree,
    workspaceId: content.workspace.id,
  });
}

export function createWorkspaceNoteVersion(source: string) {
  return createApiResourceVersion({ source });
}

export function createWorkspaceFolderVersion(folderId: string, title: string) {
  return createApiResourceVersion({ folderId, title });
}

export function createJournalEntryVersion(source: string) {
  return createApiResourceVersion({ source });
}

export function createJournalEntriesVersion(content: JournalContent) {
  return createApiResourceVersion(
    content.days.map(({ date, entries, lastIssuedSequence }) => ({
      date,
      entryIds: entries.map(({ id }) => id),
      lastIssuedSequence,
    })),
  );
}

export const journalResourceVersions = {
  entries: createJournalEntriesVersion,
  entry: createJournalEntryVersion,
} satisfies JournalDomainVersions;

export function createParsedTodoCollectionVersion(
  parsed: ParsedTodoIndexCollection,
) {
  const projection = createTodoCollectionBodyProjection(parsed);

  return createApiResourceVersion({
    body: projection.source,
    name: parsed.name,
  });
}

export function createTodoCollectionStateVersion(
  collection: TodoContent["collections"][number],
) {
  return createApiResourceVersion({
    completions: collection.completions,
    recurrences: collection.recurrences,
  });
}

export function createTodoItemStateVersion(
  collection: TodoContent["collections"][number],
  blockId: string,
) {
  return createApiResourceVersion({
    completion: collection.completions.find(
      (completion) => completion.blockId === blockId,
    ) ?? null,
    recurrence: collection.recurrences.find(
      (recurrence) => recurrence.blockId === blockId,
    ) ?? null,
  });
}

export function createTodoOrderVersion(content: TodoContent) {
  return createApiResourceVersion(
    content.collections.map(({ id }) => id),
  );
}

export const todoResourceVersions = {
  collection: createParsedTodoCollectionVersion,
  collectionState: createTodoCollectionStateVersion,
  itemState: createTodoItemStateVersion,
  order: createTodoOrderVersion,
} satisfies TodoDomainVersions;

export const workspaceResourceVersions = {
  folder: createWorkspaceFolderVersion,
  note: createWorkspaceNoteVersion,
  tree(content, workspace) {
    return createWorkspaceTreeVersion({ ...content, workspace });
  },
} satisfies WorkspaceResourceVersionPolicy;
