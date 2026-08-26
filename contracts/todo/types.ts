// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ContentRevisionDto,
  VersionedContentSnapshotDto,
  VersionedContentSyncRequestDto,
  VersionedContentSyncResultDto,
} from "../common/versionedContent.ts";

export type TodoCompletionDto = {
  blockId: string;
  completedAt: string;
};

export type TodoLocalDateDto = `${number}-${number}-${number}`;
export type TodoRecurrenceStageIdDto = `todo-recurrence-stage-${string}`;

export type TodoRecurrenceRuleDto =
  | {
      interval: number;
      kind: "daily";
    }
  | {
      interval: number;
      kind: "weekly";
      weekdays: Array<1 | 2 | 3 | 4 | 5 | 6 | 7>;
    }
  | {
      dayOfMonth: number;
      interval: number;
      kind: "monthly";
    };

export type TodoRecurrenceStageDto = {
  endsBefore: TodoLocalDateDto | null;
  id: TodoRecurrenceStageIdDto;
  rule: TodoRecurrenceRuleDto;
  startsOn: TodoLocalDateDto;
};

export type TodoRecurrenceCompletionDto = {
  completedAt: string;
  occurrenceDate: TodoLocalDateDto;
  stageId: TodoRecurrenceStageIdDto;
};

export type TodoRecurrenceDto = {
  blockId: string;
  completions: TodoRecurrenceCompletionDto[];
  stages: TodoRecurrenceStageDto[];
};

export type TodoCollectionDto = {
  id: `todo-collection-${string}`;
  source: string;
  completions: TodoCompletionDto[];
  recurrences: TodoRecurrenceDto[];
};

export type TodoContentDto = {
  schemaVersion: 4;
  syntaxSource: string;
  collections: TodoCollectionDto[];
};

export type TodoRevisionDto = ContentRevisionDto;
export type TodoSnapshotDto = VersionedContentSnapshotDto<TodoContentDto>;
export type TodoSyncRequestDto = VersionedContentSyncRequestDto<TodoContentDto>;
export type TodoSyncResultDto = VersionedContentSyncResultDto<TodoContentDto>;
