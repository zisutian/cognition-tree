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
  projectJournalContentChanges,
} from "../../../../application/journal/journalCommandExecutor.ts";
import type {
  JournalDomainVersions,
} from "../../../../application/journal/journalDomainCommands.ts";
import {
  readApiV1RuntimeNow,
  type ApiV1Runtime,
} from "../http/runtime.ts";
import {
  projectApiV1TodoChanges,
} from "../commands/todo.ts";
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
  if (context.method === "GET") {
    const snapshot = await context.store.loadSnapshot();

    context.observeRevision(snapshot.revision);
    return {
      body: { content: snapshot.content, revision: snapshot.revision },
      statusCode: 200,
    };
  }
  const commit =
    await context.readJsonBody() as WorkspaceRepositoryCommitDto;
  const result = await context.store.commitSnapshot(commit);
  const changes = projectWorkspaceContentChanges(
    context.repositoryId,
    result.before.content,
    result.after.content,
    readApiV1RuntimeNow(context.runtime).timestamp,
    result.before.projection,
    result.after.projection,
    context.versionPolicy,
  ).changes;

  context.observeRevision(result.revision);
  await context.publish(changes);
  return { body: { revision: result.revision }, statusCode: 200 };
}

export async function synchronizeApiV1Journal(
  context: ApiV1SyncContext & {
    store: VersionedContentStore<JournalContentDto, JournalParseIndex>;
    versionPolicy: JournalDomainVersions;
  },
): Promise<ApiV1SyncResult> {
  if (context.method === "GET") {
    const snapshot = await context.store.loadSnapshot();

    context.observeRevision(snapshot.revision);
    return {
      body: { content: snapshot.content, revision: snapshot.revision },
      statusCode: 200,
    };
  }
  const commit = await context.readJsonBody() as JournalCommitDto;
  const result = await context.store.commitSnapshot(commit);
  const changes = projectJournalContentChanges(
    result.before.content,
    result.after.content,
    readApiV1RuntimeNow(context.runtime).timestamp,
    result.before.projection,
    result.after.projection,
    context.versionPolicy,
  ).changes;

  context.observeRevision(result.revision);
  await context.publish(changes);
  return { body: { revision: result.revision }, statusCode: 200 };
}

export async function synchronizeApiV1Todo(
  context: ApiV1SyncContext & {
    store: VersionedContentStore<TodoContentDto, TodoParseIndex>;
  },
): Promise<ApiV1SyncResult> {
  if (context.method === "GET") {
    const snapshot = await context.store.loadSnapshot();

    context.observeRevision(snapshot.revision);
    return {
      body: { content: snapshot.content, revision: snapshot.revision },
      statusCode: 200,
    };
  }
  const commit = await context.readJsonBody() as TodoCommitDto;
  const result = await context.store.commitSnapshot(commit);
  const changes = projectApiV1TodoChanges(
    result.before.content,
    result.after.content,
    readApiV1RuntimeNow(context.runtime).timestamp,
    result.before.projection,
    result.after.projection,
  ).changes;

  context.observeRevision(result.revision);
  await context.publish(changes);
  return { body: { revision: result.revision }, statusCode: 200 };
}
