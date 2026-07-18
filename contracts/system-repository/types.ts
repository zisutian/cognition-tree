// SPDX-License-Identifier: GPL-3.0-or-later

export type SystemRepositoryPurposeDto = "system-journal" | "system-todo";
export type SystemRepositoryRevisionDto = `sha256:${string}`;

export type JournalEntryDto = {
  id: string;
  createdAt: string;
  timezoneOffsetMinutes: number;
  updatedAt: string;
  source: string;
};

export type JournalRepositoryContentDto = {
  purpose: "system-journal";
  schemaVersion: 1;
  entries: JournalEntryDto[];
};

export type TodoItemDto = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type TodoCollectionDto = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: TodoItemDto[];
};

export type TodoRepositoryContentDto = {
  purpose: "system-todo";
  schemaVersion: 1;
  collections: TodoCollectionDto[];
};

export type SystemRepositoryContentDto =
  | JournalRepositoryContentDto
  | TodoRepositoryContentDto;

export type SystemRepositorySnapshotDto = {
  content: SystemRepositoryContentDto;
  revision: SystemRepositoryRevisionDto;
};

export type SystemRepositoryCommitDto = {
  baseRevision: SystemRepositoryRevisionDto;
  content: SystemRepositoryContentDto;
};

export type SystemRepositoryCommitResultDto = {
  revision: SystemRepositoryRevisionDto;
};

export type SystemRepositoryLocationDto =
  | { serverPath: string; type: "server" }
  | { databaseName: string; type: "browser" };

export type SystemRepositoryDescriptorDto = {
  id: SystemRepositoryPurposeDto;
  label: "日记" | "代办";
  location: SystemRepositoryLocationDto;
  protected: true;
};

export type SystemRepositoryIssueDto = {
  code:
    | "adapter_unavailable"
    | "repository_corrupt"
    | "unsupported_repository_version";
  id: SystemRepositoryPurposeDto;
  location: SystemRepositoryLocationDto | null;
  message: string;
  status: "fault";
};

export type SystemRepositoryCatalogDto = {
  issues: SystemRepositoryIssueDto[];
  repositories: SystemRepositoryDescriptorDto[];
};

export type SystemRepositoryRetryResultDto = {
  status: "fault" | "ready";
};
