// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ContentRevisionDto,
  VersionedContentCommitDto,
  VersionedContentCommitResultDto,
  VersionedContentSnapshotDto,
} from "../common/versionedContent.ts";

export type TodoCompletionDto = {
  blockId: string;
  completedAt: string;
};

export type TodoCollectionDto = {
  id: `todo-collection-${string}`;
  source: string;
  completions: TodoCompletionDto[];
};

export type TodoContentDto = {
  schemaVersion: 3;
  syntaxSource: string;
  collections: TodoCollectionDto[];
};

export type TodoRevisionDto = ContentRevisionDto;
export type TodoSnapshotDto = VersionedContentSnapshotDto<TodoContentDto>;
export type TodoCommitDto = VersionedContentCommitDto<TodoContentDto>;
export type TodoCommitResultDto = VersionedContentCommitResultDto;
