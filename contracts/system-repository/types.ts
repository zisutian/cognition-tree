// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ContentRevisionDto,
  VersionedContentCommitDto,
  VersionedContentCommitResultDto,
  VersionedContentSnapshotDto,
} from "../common/versionedContent.ts";

export type SystemRepositoryPurposeDto = "system-journal" | "system-todo";
export type SystemRepositoryRevisionDto = ContentRevisionDto;

export type JournalEntryDto = {
  id: string;
  createdAt: string;
  sequence: number;
  timezoneOffsetMinutes: number;
  updatedAt: string;
  source: string;
};

export type JournalDayDto = {
  date: string;
  entries: JournalEntryDto[];
  lastIssuedSequence: number;
};

export type JournalRepositoryContentDto = {
  purpose: "system-journal";
  schemaVersion: 3;
  syntaxSource: string;
  days: JournalDayDto[];
};

export type TodoCompletionDto = {
  blockId: string;
  completedAt: string;
};

export type TodoCollectionDto = {
  id: string;
  source: string;
  completions: TodoCompletionDto[];
};

export type TodoRepositoryContentDto = {
  purpose: "system-todo";
  schemaVersion: 3;
  syntaxSource: string;
  collections: TodoCollectionDto[];
};

export type SystemRepositoryContentDto =
  | JournalRepositoryContentDto
  | TodoRepositoryContentDto;

export type SystemRepositorySnapshotDto =
  VersionedContentSnapshotDto<SystemRepositoryContentDto>;

export type SystemRepositoryCommitDto =
  VersionedContentCommitDto<SystemRepositoryContentDto>;

export type SystemRepositoryCommitResultDto =
  VersionedContentCommitResultDto;

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
