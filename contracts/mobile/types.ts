// SPDX-License-Identifier: GPL-3.0-or-later

import type { ContentRevisionDto } from "../common/versionedContent.ts";
import type {
  TodoLocalDateDto,
  TodoRecurrenceRuleDto,
} from "../todo/types.ts";

export const cognitionMobileContractVersion = 1 as const;

export type MobileBuiltInStatusDto = {
  message?: string;
  status: "fault" | "ready";
};

export type MobileCapabilityStatusDto = {
  capabilities: {
    journal: "read-only";
    todo: "completion-write";
  };
  contractVersion: typeof cognitionMobileContractVersion;
  domains: {
    journal: MobileBuiltInStatusDto;
    todo: MobileBuiltInStatusDto;
  };
};

export type MobileCtnBlockDto = {
  children: MobileCtnBlockDto[];
  id: string;
  label: string;
  level: number;
  lineNumber: number;
  text: string;
  type: string;
};

export type MobileJournalEntrySummaryDto = {
  createdAt: string;
  id: string;
  month: string;
  title: string;
  updatedAt: string;
};

export type MobileJournalEntriesPageDto = {
  contractVersion: typeof cognitionMobileContractVersion;
  entries: MobileJournalEntrySummaryDto[];
  nextCursor: string | null;
  revision: ContentRevisionDto;
};

export type MobileJournalEntryDto = {
  blocks: MobileCtnBlockDto[];
  contractVersion: typeof cognitionMobileContractVersion;
  entry: MobileJournalEntrySummaryDto;
  revision: ContentRevisionDto;
};

export type MobileTodoRecurrenceDto = {
  active: boolean;
  completedCount: number;
  currentOccurrenceDate: TodoLocalDateDto | null;
  nextOccurrenceDate: TodoLocalDateDto | null;
  rule: TodoRecurrenceRuleDto;
  totalCount: number;
};

export type MobileTodoTaskDto = {
  children: MobileTodoTaskDto[];
  completed: boolean;
  completedAt: string | null;
  id: string;
  label: string;
  level: number;
  lineNumber: number;
  recurrence: MobileTodoRecurrenceDto | null;
  text: string;
};

export type MobileTodoCollectionSummaryDto = {
  completedTaskCount: number;
  id: string;
  name: string;
  taskCount: number;
};

export type MobileTodoCollectionsDto = {
  collections: MobileTodoCollectionSummaryDto[];
  contractVersion: typeof cognitionMobileContractVersion;
  revision: ContentRevisionDto;
};

export type MobileTodoCollectionDto = {
  collection: MobileTodoCollectionSummaryDto;
  contractVersion: typeof cognitionMobileContractVersion;
  revision: ContentRevisionDto;
  tasks: MobileTodoTaskDto[];
};

export type MobileTodoCompletionRequestDto = {
  completed: boolean;
  expectedRevision: ContentRevisionDto;
  occurrenceDate: TodoLocalDateDto | null;
};

export type MobileTodoCompletionResultDto = {
  contractVersion: typeof cognitionMobileContractVersion;
  revision: ContentRevisionDto;
  task: MobileTodoTaskDto;
};

export type MobileApiErrorCodeDto =
  | "not_found"
  | "revision_conflict"
  | "stale_occurrence";

export type MobileApiErrorDto = {
  code: MobileApiErrorCodeDto;
  contractVersion: typeof cognitionMobileContractVersion;
  currentOccurrenceDate?: TodoLocalDateDto | null;
  currentRevision?: ContentRevisionDto;
  message: string;
  requestId: string;
};
