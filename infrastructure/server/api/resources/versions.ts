// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { serializeJsonIteratively } from "../../../../contracts/common/index.ts";
import type { ApiResourceVersionDto } from "../../../../contracts/api/index.ts";
import type { WorkspaceRepositoryContentDto } from "../../../../contracts/workspace/index.ts";
import { createWorkspaceResourceVersions } from "../../../../application/workspace/index.ts";
import { createJournalResourceVersions } from "../../../../application/journal/index.ts";
import { createTodoResourceVersions } from "../../../../application/todo/index.ts";

export function createApiResourceVersion(value: unknown): ApiResourceVersionDto {
  return `sha256:${createHash("sha256")
    .update(serializeJsonIteratively(value, { sortObjectKeys: true }))
    .digest("hex")}`;
}

export const workspaceResourceVersions = createWorkspaceResourceVersions(
  createApiResourceVersion,
);
export const journalResourceVersions = createJournalResourceVersions(
  createApiResourceVersion,
);
export const todoResourceVersions = createTodoResourceVersions(
  createApiResourceVersion,
);

export const createWorkspaceFolderVersion = workspaceResourceVersions.folder;
export const createWorkspaceNoteVersion = workspaceResourceVersions.note;
export const createWorkspaceTreeVersion = (content: WorkspaceRepositoryContentDto) =>
  workspaceResourceVersions.tree(content, content.workspace);
export const createJournalEntryVersion = journalResourceVersions.entry;
export const createJournalEntriesVersion = journalResourceVersions.entries;
export const createParsedTodoCollectionVersion = todoResourceVersions.collection;
export const createTodoCollectionStateVersion = todoResourceVersions.collectionState;
export const createTodoItemStateVersion = todoResourceVersions.itemState;
export const createTodoOrderVersion = todoResourceVersions.order;
