// SPDX-License-Identifier: GPL-3.0-or-later

import { parseJournalContent } from "../../../contracts/journal/parseJournal.ts";
import type {
  JournalCommitDto,
  JournalContentDto,
} from "../../../contracts/journal/types.ts";
import { parseTodoContent } from "../../../contracts/todo/parseTodo.ts";
import type {
  TodoCommitDto,
  TodoContentDto,
} from "../../../contracts/todo/types.ts";
import type {
  ApiV1DomainChangeSetDto,
} from "../../../contracts/api/types.ts";
import type {
  WorkspaceRepositoryCommitDto,
} from "../../../contracts/workspace/types.ts";
import type {
  VersionedContentStore,
} from "../repository/versionedContentStore.ts";
import type {
  WorkspaceRepositoryStore,
} from "../repository/repositoryStore.ts";
import {
  projectApiV1JournalChanges,
} from "./apiV1JournalCommands.ts";
import {
  readApiV1RuntimeNow,
  type ApiV1Runtime,
} from "./apiV1Runtime.ts";
import {
  projectApiV1TodoChanges,
} from "./apiV1TodoCommands.ts";
import {
  projectApiV1WorkspaceChanges,
} from "./apiV1WorkspaceCommands.ts";

type ApiV1SyncResult = {
  body: unknown;
  statusCode: number;
};

type ApiV1SyncContext = {
  method: string;
  publish(changes: ApiV1DomainChangeSetDto): Promise<void>;
  readJsonBody(): Promise<unknown>;
  runtime: ApiV1Runtime;
};

export async function synchronizeApiV1Workspace(
  context: ApiV1SyncContext & {
    repositoryId: string;
    store: WorkspaceRepositoryStore;
  },
): Promise<ApiV1SyncResult> {
  if (context.method === "GET") {
    return { body: await context.store.loadSnapshot(), statusCode: 200 };
  }
  const before = await context.store.loadSnapshot();
  const commit =
    await context.readJsonBody() as WorkspaceRepositoryCommitDto;
  const result = await context.store.commitSnapshot(commit);
  const after = await context.store.loadSnapshot();
  const changes = projectApiV1WorkspaceChanges(
    context.repositoryId,
    before.content,
    after.content,
    readApiV1RuntimeNow(context.runtime).timestamp,
  ).changes;

  await context.publish(changes);
  return { body: result, statusCode: 200 };
}

export async function synchronizeApiV1Journal(
  context: ApiV1SyncContext & {
    store: VersionedContentStore<JournalContentDto>;
  },
): Promise<ApiV1SyncResult> {
  if (context.method === "GET") {
    return { body: await context.store.loadSnapshot(), statusCode: 200 };
  }
  const before = await context.store.loadSnapshot();
  const commit = await context.readJsonBody() as JournalCommitDto;
  const result = await context.store.commitSnapshot(commit);
  const after = await context.store.loadSnapshot();
  const changes = projectApiV1JournalChanges(
    parseJournalContent(before.content),
    parseJournalContent(after.content),
    readApiV1RuntimeNow(context.runtime).timestamp,
  ).changes;

  await context.publish(changes);
  return { body: result, statusCode: 200 };
}

export async function synchronizeApiV1Todo(
  context: ApiV1SyncContext & {
    store: VersionedContentStore<TodoContentDto>;
  },
): Promise<ApiV1SyncResult> {
  if (context.method === "GET") {
    return { body: await context.store.loadSnapshot(), statusCode: 200 };
  }
  const before = await context.store.loadSnapshot();
  const commit = await context.readJsonBody() as TodoCommitDto;
  const result = await context.store.commitSnapshot(commit);
  const after = await context.store.loadSnapshot();
  const changes = projectApiV1TodoChanges(
    parseTodoContent(before.content),
    parseTodoContent(after.content),
    readApiV1RuntimeNow(context.runtime).timestamp,
  ).changes;

  await context.publish(changes);
  return { body: result, statusCode: 200 };
}
