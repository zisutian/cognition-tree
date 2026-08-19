// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import type { ApiV1ResourceVersionDto } from "../../../contracts/api/types.ts";
import type { WorkspaceRepositoryContentDto } from "../../../contracts/workspace/types.ts";
import type { JournalContent } from "../../../core/journal/model/journalContent.ts";
import type { ParsedTodoIndexCollection } from "../../../core/todo/indexes/todoParseIndex.ts";
import {
  createTodoCollectionBodyProjection,
  type TodoContent,
} from "../../../core/todo/model/todoContent.ts";

export function createApiV1ResourceVersion(
  value: unknown,
): ApiV1ResourceVersionDto {
  return `sha256:${createHash("sha256")
    .update(serializeJsonIteratively(value, { sortObjectKeys: true }))
    .digest("hex")}`;
}

export function createWorkspaceTreeVersion(
  content: WorkspaceRepositoryContentDto,
) {
  return createApiV1ResourceVersion({
    tree: content.workspace.tree,
    workspaceId: content.workspace.id,
  });
}

export function createWorkspaceNoteVersion(source: string) {
  return createApiV1ResourceVersion({ source });
}

export function createWorkspaceFolderVersion(folderId: string, title: string) {
  return createApiV1ResourceVersion({ folderId, title });
}

export function createJournalEntryVersion(source: string) {
  return createApiV1ResourceVersion({ source });
}

export function createJournalEntriesVersion(content: JournalContent) {
  return createApiV1ResourceVersion(
    content.days.map(({ date, entries, lastIssuedSequence }) => ({
      date,
      entryIds: entries.map(({ id }) => id),
      lastIssuedSequence,
    })),
  );
}
export function createParsedTodoCollectionVersion(
  parsed: ParsedTodoIndexCollection,
) {
  const projection = createTodoCollectionBodyProjection(parsed);

  return createApiV1ResourceVersion({
    body: projection.source,
    name: parsed.name,
  });
}

export function createTodoCollectionStateVersion(
  collection: TodoContent["collections"][number],
) {
  return createApiV1ResourceVersion({
    completions: collection.completions,
    recurrences: collection.recurrences,
  });
}

export function createTodoItemStateVersion(
  collection: TodoContent["collections"][number],
  blockId: string,
) {
  return createApiV1ResourceVersion({
    completion: collection.completions.find(
      (completion) => completion.blockId === blockId,
    ) ?? null,
    recurrence: collection.recurrences.find(
      (recurrence) => recurrence.blockId === blockId,
    ) ?? null,
  });
}

export function createTodoOrderVersion(content: TodoContent) {
  return createApiV1ResourceVersion(
    content.collections.map(({ id }) => id),
  );
}
