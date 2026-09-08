// SPDX-License-Identifier: GPL-3.0-or-later

import type { CommandRuntime } from "../commands/index.ts";
import type { JournalDomainVersions } from "../journal/index.ts";
import type { ContentOperationLedgerPort } from "../operations/index.ts";
import type { PreparedVersionedStore } from "../persistence/index.ts";
import type { TodoDomainVersions } from "../todo/index.ts";
import type {
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation,
  WorkspaceResourceVersionPolicy,
} from "../workspace/index.ts";
import type {
  JournalContent,
  JournalParseIndex,
} from "../../core/journal/index.ts";
import type {
  TodoContent,
  TodoLocalDate,
  TodoParseIndex,
} from "../../core/todo/index.ts";
import type { DomainChangeSet } from "../../core/sync/index.ts";

export type ContentRevision = `sha256:${string}`;
export type ContentWorkspaceStore = PreparedVersionedStore<
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation,
  ContentRevision
>;
export type ContentJournalStore = PreparedVersionedStore<
  JournalContent,
  JournalParseIndex,
  ContentRevision
>;
export type ContentTodoStore = PreparedVersionedStore<
  TodoContent,
  TodoParseIndex,
  ContentRevision
>;
export type ContentCatalog = {
  repositories: { id: string; label: string }[];
  issues: { id: string; message: string }[];
};

/** The adapter holds catalog admission for the entire callback, including CAS. */
export type ContentCatalogSession = {
  read(): Promise<ContentCatalog>;
  validateName(name: string, excludedId?: string): Promise<string>;
  getStore(id: string): Promise<ContentWorkspaceStore>;
  create(
    label: string,
    content: WorkspaceRepositoryContent,
  ): Promise<{ id: string; label: string }>;
  rename(id: string, label: string): Promise<{ id: string; label: string }>;
  delete(id: string): Promise<void>;
};

export type ContentServicePorts = {
  catalog: {
    run<Result>(
      operation: (session: ContentCatalogSession) => Promise<Result>,
    ): Promise<Result>;
  };
  journal(): Promise<ContentJournalStore>;
  todo(): Promise<ContentTodoStore>;
  ledger: ContentOperationLedgerPort;
  digest(value: unknown): ContentRevision;
  runtime: CommandRuntime & {
    timezoneOffsetMinutes(date: Date): number;
    today(date: Date): TodoLocalDate;
  };
  versions: {
    workspace: WorkspaceResourceVersionPolicy;
    journal: JournalDomainVersions;
    todo: TodoDomainVersions;
  };
  onCommitted(
    store:
      | { domain: "workspace"; repositoryId: string }
      | { domain: "journal" | "todo" },
    revision: ContentRevision,
    changes: DomainChangeSet,
  ): void;
  onCatalogChanged(
    repositoryId: string,
    kind: "created" | "updated" | "deleted",
    timestamp: string,
  ): void;
};
