// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalContent } from "../../core/journal/model/journalContent";
import type { TodoContent } from "../../core/todo/model/todoContent";
import type { JournalParseIndex } from "../../core/journal/indexes/journalParseIndex";
import type { TodoParseIndex } from "../../core/todo/indexes/todoParseIndex";
import type {
  VersionedRepository,
  VersionedRepositoryBackend,
  VersionedRepositorySnapshot,
} from "../persistence/versionedRepository";

export type ContentRevision = `sha256:${string}`;
export type BuiltInId = "journal" | "todo";
export type BuiltInLocation = { serverPath: string; type: "server" };
export type BuiltInDescriptor = {
  id: BuiltInId;
  label: "日记" | "代办";
  location: BuiltInLocation;
  protected: true;
};
export type BuiltInIssue = {
  code:
    | "adapter_unavailable"
    | "repository_corrupt"
    | "unsupported_repository_version";
  id: BuiltInId;
  location: BuiltInLocation | null;
  message: string;
  status: "fault";
};
export type BuiltInCatalogData = {
  issues: BuiltInIssue[];
  repositories: BuiltInDescriptor[];
};
export type BuiltInRetryResult = { status: "fault" | "ready" };
export type BuiltInLocalDraftRevision = `draft:${string}`;
export type JournalRevision = ContentRevision;
export type TodoRevision = ContentRevision;

export type JournalRepositoryBackend = VersionedRepositoryBackend<
  JournalContent,
  JournalRevision
>;
export type TodoRepositoryBackend = VersionedRepositoryBackend<
  TodoContent,
  TodoRevision
>;

export type JournalRepositorySnapshot = VersionedRepositorySnapshot<
  JournalContent,
  JournalRevision,
  BuiltInLocalDraftRevision,
  JournalParseIndex
>;
export type TodoRepositorySnapshot = VersionedRepositorySnapshot<
  TodoContent,
  TodoRevision,
  BuiltInLocalDraftRevision,
  TodoParseIndex
>;

export type JournalRepository = VersionedRepository<
  JournalContent,
  JournalRevision,
  BuiltInLocalDraftRevision,
  BuiltInLocation,
  JournalParseIndex
>;
export type TodoRepository = VersionedRepository<
  TodoContent,
  TodoRevision,
  BuiltInLocalDraftRevision,
  BuiltInLocation,
  TodoParseIndex
>;

export type BuiltInCatalog = {
  label: string;
  listBuiltIns(): Promise<BuiltInCatalogData>;
  openJournal(descriptor: BuiltInDescriptor): JournalRepository;
  openTodo(descriptor: BuiltInDescriptor): TodoRepository;
  retry(id: BuiltInId): Promise<BuiltInRetryResult>;
};

export type BuiltInRuntime = { catalog: BuiltInCatalog };
