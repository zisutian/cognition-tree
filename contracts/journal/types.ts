// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ContentRevisionDto,
  VersionedContentCommitDto,
  VersionedContentCommitResultDto,
  VersionedContentSnapshotDto,
} from "../common/versionedContent.ts";

export type JournalEntryDto = {
  id: `journal-entry-${string}`;
  createdAt: string;
  updatedAt: string;
  timezoneOffsetMinutes: number;
  sequence: number;
  source: string;
};

export type JournalDayDto = {
  date: string;
  lastIssuedSequence: number;
  entries: JournalEntryDto[];
};

export type JournalContentDto = {
  schemaVersion: 3;
  syntaxSource: string;
  days: JournalDayDto[];
};

export type JournalRevisionDto = ContentRevisionDto;
export type JournalSnapshotDto = VersionedContentSnapshotDto<JournalContentDto>;
export type JournalCommitDto = VersionedContentCommitDto<JournalContentDto>;
export type JournalCommitResultDto = VersionedContentCommitResultDto;
