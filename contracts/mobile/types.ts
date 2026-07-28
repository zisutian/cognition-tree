// SPDX-License-Identifier: GPL-3.0-or-later

import type { ContentRevisionDto } from "../common/versionedContent.ts";
import type {
  TodoLocalDateDto,
  TodoRecurrenceRuleDto,
} from "../todo/types.ts";

export const cognitionMobileContractVersion = 1 as const;
export const cognitionMobileV2ContractVersion = 2 as const;

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

export type MobileV2CapabilityStatusDto = {
  capabilities: {
    journal: "read-only";
    todo: "completion-write";
  };
  contractVersion: typeof cognitionMobileV2ContractVersion;
  domains: {
    journal: MobileBuiltInStatusDto;
    todo: MobileBuiltInStatusDto;
  };
};

export type MobileV2CtnBlockDto = {
  children: MobileV2CtnBlockDto[];
  id: string;
  label: string;
  text: string;
};

export type MobileV2JournalEntriesPageDto = {
  contractVersion: typeof cognitionMobileV2ContractVersion;
  entries: MobileJournalEntrySummaryDto[];
  nextCursor: string | null;
  revision: ContentRevisionDto;
};

export type MobileV2JournalEntryDto = {
  blocks: MobileV2CtnBlockDto[];
  contractVersion: typeof cognitionMobileV2ContractVersion;
  entry: MobileJournalEntrySummaryDto;
  revision: ContentRevisionDto;
};

export type MobileV2TodoTaskDto = {
  children: MobileV2TodoTaskDto[];
  completed: boolean;
  id: string;
  recurrence: MobileTodoRecurrenceDto | null;
  text: string;
};

export type MobileV2TodoCollectionsDto = {
  collections: MobileTodoCollectionSummaryDto[];
  contractVersion: typeof cognitionMobileV2ContractVersion;
  revision: ContentRevisionDto;
};

export type MobileV2TodoCollectionDto = {
  collection: MobileTodoCollectionSummaryDto;
  contractVersion: typeof cognitionMobileV2ContractVersion;
  revision: ContentRevisionDto;
  tasks: MobileV2TodoTaskDto[];
};

export type MobileV2TodoCompletionRequestDto = MobileTodoCompletionRequestDto;

export type MobileV2TodoCompletionResultDto = {
  collection: MobileTodoCollectionSummaryDto;
  contractVersion: typeof cognitionMobileV2ContractVersion;
  revision: ContentRevisionDto;
  task: MobileV2TodoTaskDto;
};

export type MobileV2ApiErrorCodeDto =
  | "domain_unavailable"
  | "invalid_request"
  | "not_found"
  | "projection_too_large"
  | "revision_conflict"
  | "stale_occurrence";

export type MobileV2ApiErrorDto = {
  code: MobileV2ApiErrorCodeDto;
  contractVersion: typeof cognitionMobileV2ContractVersion;
  currentOccurrenceDate?: TodoLocalDateDto | null;
  currentRevision?: ContentRevisionDto;
  message: string;
  requestId: string;
};
