// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalContent } from "../../core/journal/model/journalContent";
import type { TodoContent } from "../../core/todo/model/todoContent";
import type {
  VersionedRepository,
  VersionedRepositoryBackend,
  VersionedRepositorySnapshot,
} from "./versionedRepository";

export type ContentRevision = `sha256:${string}`;
export type BuiltInId = "journal" | "todo";
export type BuiltInLocation =
  | { serverPath: string; type: "server" }
  | { databaseName: string; type: "browser" };
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
  BuiltInLocalDraftRevision
>;
export type TodoRepositorySnapshot = VersionedRepositorySnapshot<
  TodoContent,
  TodoRevision,
  BuiltInLocalDraftRevision
>;

export type JournalRepository = VersionedRepository<
  JournalContent,
  JournalRevision,
  BuiltInLocalDraftRevision,
  BuiltInLocation
>;
export type TodoRepository = VersionedRepository<
  TodoContent,
  TodoRevision,
  BuiltInLocalDraftRevision,
  BuiltInLocation
>;

export type BuiltInCatalog = {
  label: string;
  listBuiltIns(): Promise<BuiltInCatalogData>;
  openJournal(descriptor: BuiltInDescriptor): JournalRepository;
  openTodo(descriptor: BuiltInDescriptor): TodoRepository;
  retry(id: BuiltInId): Promise<BuiltInRetryResult>;
};

export type BuiltInRuntime = { catalog: BuiltInCatalog };
