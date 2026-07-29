// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnTextEdit } from "../ctn/metadata/textEdits.ts";
import type { DomainChangeSet } from "./domainChangeSet.ts";

export type DomainCommandOutcome =
  | { kind: "ok" }
  | { folderId: string; kind: "folder-created" }
  | { kind: "note-created"; noteId: string }
  | { entryId: string; kind: "journal-entry-created" }
  | { collectionId: string; kind: "todo-collection-created" };

export type DomainTextEdit = CtnTextEdit & {
  resourceId: string;
};

export type DomainTransition<Content> = {
  changes: DomainChangeSet;
  content: Content;
  diff: DomainTextEdit[];
  result: DomainCommandOutcome;
  warnings: readonly string[];
};
