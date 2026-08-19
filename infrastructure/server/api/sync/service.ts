// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  JournalCommitDto,
  JournalContentDto,
} from "../../../../contracts/journal/types.ts";
import type {
  TodoCommitDto,
  TodoContentDto,
} from "../../../../contracts/todo/types.ts";
import type {
  ApiV1DomainChangeSetDto,
} from "../../../../contracts/api/types.ts";
import type {
  WorkspaceRepositoryCommitDto,
} from "../../../../contracts/workspace/types.ts";
import type {
  VersionedContentStore,
} from "../../repository/versioned/contentStore.ts";
import type { JournalParseIndex } from "../../../../core/journal/indexes/journalParseIndex.ts";
import type { TodoParseIndex } from "../../../../core/todo/indexes/todoParseIndex.ts";
import type {
  WorkspaceRepositoryStore,
} from "../../repository/store.ts";
import {
  executeSnapshotSync,
} from "../../../../application/sync/snapshotSync.ts";
import {
  createSnapshotSyncStoreAdapter,
} from "../../repository/snapshotSyncStoreAdapter.ts";
import {
  projectJournalContentChanges,
} from "../../../../application/journal/journalCommandExecutor.ts";
import type {
  JournalDomainVersions,
} from "../../../../application/journal/journalDomainCommands.ts";
import {
  type ApiV1Runtime,
} from "../http/runtime.ts";
import {
  projectTodoContentChanges,
} from "../../../../application/todo/todoCommandExecutor.ts";
import type {
  TodoDomainVersions,
} from "../../../../application/todo/todoDomainCommands.ts";
import {
  projectWorkspaceContentChanges,
  type WorkspaceResourceVersionPolicy,
} from "../../../../application/workspace/commands/workspaceCommandExecutor.ts";

type ApiV1SyncResult = {
  body: unknown;
  statusCode: number;
};

type ApiV1SyncContext = {
  method: string;
  observeRevision(revision: `sha256:${string}`): void;
  publish(changes: ApiV1DomainChangeSetDto): Promise<void>;
  readJsonBody(): Promise<unknown>;
  runtime: ApiV1Runtime;
};

export async function synchronizeApiV1Workspace(
  context: ApiV1SyncContext & {
    repositoryId: string;
    store: WorkspaceRepositoryStore;
    versionPolicy: WorkspaceResourceVersionPolicy;
  },
): Promise<ApiV1SyncResult> {
  const request = context.method === "GET"
    ? { mode: "load" as const }
    : {
        ...await context.readJsonBody() as WorkspaceRepositoryCommitDto,
        mode: "commit" as const,
      };
  const result = await executeSnapshotSync({
    projectChanges: ({ after, before, timestamp }) =>
      projectWorkspaceContentChanges(
        context.repositoryId,
        before.content,
        after.content,
        timestamp,
        before.projection,
        after.projection,
        context.versionPolicy,
      ).changes,
    request,
    runtime: context.runtime,
    store: createSnapshotSyncStoreAdapter(context.store),
  });

  context.observeRevision(result.revision);
  if (result.status === "loaded") {
    return {
      body: { content: result.content, revision: result.revision },
      statusCode: 200,
    };
  }
  await context.publish(result.changes);
  return { body: { revision: result.revision }, statusCode: 200 };
}

export async function synchronizeApiV1Journal(
  context: ApiV1SyncContext & {
    store: VersionedContentStore<JournalContentDto, JournalParseIndex>;
    versionPolicy: JournalDomainVersions;
  },
): Promise<ApiV1SyncResult> {
  const request = context.method === "GET"
    ? { mode: "load" as const }
    : {
        ...await context.readJsonBody() as JournalCommitDto,
        mode: "commit" as const,
      };
  const result = await executeSnapshotSync({
    projectChanges: ({ after, before, timestamp }) =>
      projectJournalContentChanges(
        before.content,
        after.content,
        timestamp,
        before.projection,
        after.projection,
        context.versionPolicy,
      ).changes,
    request,
    runtime: context.runtime,
    store: createSnapshotSyncStoreAdapter(context.store),
  });

  context.observeRevision(result.revision);
  if (result.status === "loaded") {
    return {
      body: { content: result.content, revision: result.revision },
      statusCode: 200,
    };
  }
  await context.publish(result.changes);
  return { body: { revision: result.revision }, statusCode: 200 };
}

export async function synchronizeApiV1Todo(
  context: ApiV1SyncContext & {
    store: VersionedContentStore<TodoContentDto, TodoParseIndex>;
    versionPolicy: TodoDomainVersions;
  },
): Promise<ApiV1SyncResult> {
  const request = context.method === "GET"
    ? { mode: "load" as const }
    : {
        ...await context.readJsonBody() as TodoCommitDto,
        mode: "commit" as const,
      };
  const result = await executeSnapshotSync({
    projectChanges: ({ after, before, timestamp }) =>
      projectTodoContentChanges(
        before.content,
        after.content,
        timestamp,
        before.projection,
        after.projection,
        context.versionPolicy,
      ).changes,
    request,
    runtime: context.runtime,
    store: createSnapshotSyncStoreAdapter(context.store),
  });

  context.observeRevision(result.revision);
  if (result.status === "loaded") {
    return {
      body: { content: result.content, revision: result.revision },
      statusCode: 200,
    };
  }
  await context.publish(result.changes);
  return { body: { revision: result.revision }, statusCode: 200 };
}
