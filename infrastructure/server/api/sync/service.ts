// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  JournalContentDto,
  JournalSyncRequestDto,
} from "../../../../contracts/journal/types.ts";
import type {
  TodoContentDto,
  TodoSyncRequestDto,
} from "../../../../contracts/todo/types.ts";
import type { DomainChangeSetDto } from "../../../../contracts/common/domainChanges.ts";
import type {
  WorkspaceRepositorySyncRequestDto,
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
  SnapshotSyncBaseRevisionError,
  SnapshotSyncMergeConflictError,
  SnapshotSyncRevisionConflictError,
  SnapshotSyncRetryExhaustedError,
} from "../../../../application/sync/snapshotSync.ts";
import {
  prepareWorkspaceWriteContent,
} from "../../repository/workspace/preparation.ts";
import {
  prepareJournalWriteContent,
} from "../../repository/built-ins/journalStore.ts";
import {
  prepareTodoWriteContent,
} from "../../repository/built-ins/todoStore.ts";
import {
  projectJournalContentChanges,
} from "../../../../application/journal/journalContentProjection.ts";
import type {
  JournalDomainVersions,
} from "../../../../application/journal/journalDomainCommands.ts";
import {
  type ApiRuntime,
} from "../http/runtime.ts";
import {
  projectTodoContentChanges,
} from "../../../../application/todo/todoContentProjection.ts";
import type {
  TodoDomainVersions,
} from "../../../../application/todo/todoDomainCommands.ts";
import {
  projectWorkspaceContentChanges,
} from "../../../../application/workspace/commands/workspaceContentProjection.ts";
import type { WorkspaceResourceVersionPolicy } from "../../../../application/workspace/commands/workspaceAgentCommandPreparation.ts";
import { mergeWorkspaceContent } from "../../../../application/workspace/persistence/workspaceThreeWayMerge.ts";
import { mergeJournalContent } from "../../../../application/journal/persistence/journalThreeWayMerge.ts";
import { mergeTodoContent } from "../../../../application/todo/persistence/todoThreeWayMerge.ts";
import { createWorkspaceRepositoryRevision } from "../../repository/workspace/revision.ts";
import { createJournalRevision } from "../../repository/built-ins/journalStore.ts";
import { createTodoRevision } from "../../repository/built-ins/todoStore.ts";
import { WorkspaceRevisionConflictError } from "../../repository/store.ts";
import { VersionedContentRevisionConflictError } from "../../repository/versioned/contentStore.ts";
import { ApiRequestError } from "../http/errors.ts";

type ApiSyncResult = {
  body: unknown;
  statusCode: number;
};

type ApiSyncContext = {
  mode: "commit" | "load";
  observeRevision(revision: `sha256:${string}`): void;
  publish(changes: DomainChangeSetDto): Promise<void>;
  readJsonBody(): Promise<unknown>;
  runtime: ApiRuntime;
};

function syncStore<Content, Projection, Revision extends string>(store: {
  commit(input: {
    baseRevision: Revision;
    content: Content;
    projection: Projection;
  }): Promise<{
    after: { content: Content; projection: Projection; revision: Revision };
    before: { content: Content; projection: Projection; revision: Revision };
    revision: Revision;
  }>;
  loadSnapshot(): Promise<{
    content: Content;
    projection: Projection;
    revision: Revision;
  }>;
}) {
  return {
    commit: async (input: {
      baseRevision: Revision;
      content: Content;
      projection: Projection;
    }) => {
      try {
        return await store.commit(input);
      } catch (error) {
        if (
          error instanceof WorkspaceRevisionConflictError ||
          error instanceof VersionedContentRevisionConflictError
        ) {
          throw new SnapshotSyncRevisionConflictError(
            error.currentRevision as Revision,
          );
        }
        throw error;
      }
    },
    loadSnapshot: () => store.loadSnapshot(),
  };
}

function throwApiSyncFailure(
  error: unknown,
  store: { domain: "journal" | "todo" } | {
    domain: "workspace";
    repositoryId: string;
  },
): never {
  if (error instanceof SnapshotSyncBaseRevisionError) {
    throw new ApiRequestError("invalid_request", error.message, {
      details: {
        issues: [{
          path: "$.base.revision",
          reason: "does not match $.base.content",
        }],
      },
    });
  }
  if (error instanceof SnapshotSyncMergeConflictError) {
    throw new ApiRequestError("merge_conflict", error.message, {
      details: {
        baseRevision: error.baseRevision,
        conflictUnits: error.unitIds.map((id) => ({ id })),
        currentRevision: error.currentRevision,
        store,
      },
    });
  }
  if (error instanceof SnapshotSyncRetryExhaustedError) {
    throw new ApiRequestError("resource_conflict", error.message, {
      details: { currentRevision: error.currentRevision },
      retryable: true,
    });
  }
  throw error;
}

export async function synchronizeApiWorkspace(
  context: ApiSyncContext & {
    repositoryId: string;
    store: WorkspaceRepositoryStore;
    versionPolicy: WorkspaceResourceVersionPolicy;
  },
): Promise<ApiSyncResult> {
  const request = context.mode === "load"
    ? { mode: "load" as const }
    : {
        ...await context.readJsonBody() as WorkspaceRepositorySyncRequestDto,
        mode: "commit" as const,
      };
  const result = await executeSnapshotSync({
    merge: mergeWorkspaceContent,
    prepare: (content, previous) =>
      prepareWorkspaceWriteContent(content, previous),
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
    revisionOf: createWorkspaceRepositoryRevision,
    runtime: context.runtime,
    store: syncStore(context.store),
  }).catch((error: unknown) => throwApiSyncFailure(error, {
    domain: "workspace",
    repositoryId: context.repositoryId,
  }));

  context.observeRevision(result.snapshot.revision);
  if (result.status === "loaded") {
    return {
      body: result.snapshot,
      statusCode: 200,
    };
  }
  if (result.changes) await context.publish(result.changes);
  return {
    body: { outcome: result.outcome, snapshot: result.snapshot },
    statusCode: 200,
  };
}

export async function synchronizeApiJournal(
  context: ApiSyncContext & {
    store: VersionedContentStore<JournalContentDto, JournalParseIndex>;
    versionPolicy: JournalDomainVersions;
  },
): Promise<ApiSyncResult> {
  const request = context.mode === "load"
    ? { mode: "load" as const }
    : {
        ...await context.readJsonBody() as JournalSyncRequestDto,
        mode: "commit" as const,
      };
  const result = await executeSnapshotSync({
    merge: mergeJournalContent,
    prepare: (content, previous) =>
      prepareJournalWriteContent(content, previous),
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
    revisionOf: createJournalRevision,
    runtime: context.runtime,
    store: syncStore(context.store),
  }).catch((error: unknown) => throwApiSyncFailure(error, {
    domain: "journal",
  }));

  context.observeRevision(result.snapshot.revision);
  if (result.status === "loaded") {
    return {
      body: result.snapshot,
      statusCode: 200,
    };
  }
  if (result.changes) await context.publish(result.changes);
  return {
    body: { outcome: result.outcome, snapshot: result.snapshot },
    statusCode: 200,
  };
}

export async function synchronizeApiTodo(
  context: ApiSyncContext & {
    store: VersionedContentStore<TodoContentDto, TodoParseIndex>;
    versionPolicy: TodoDomainVersions;
  },
): Promise<ApiSyncResult> {
  const request = context.mode === "load"
    ? { mode: "load" as const }
    : {
        ...await context.readJsonBody() as TodoSyncRequestDto,
        mode: "commit" as const,
      };
  const result = await executeSnapshotSync({
    merge: mergeTodoContent,
    prepare: (content, previous) =>
      prepareTodoWriteContent(content, previous),
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
    revisionOf: createTodoRevision,
    runtime: context.runtime,
    store: syncStore(context.store),
  }).catch((error: unknown) => throwApiSyncFailure(error, {
    domain: "todo",
  }));

  context.observeRevision(result.snapshot.revision);
  if (result.status === "loaded") {
    return {
      body: result.snapshot,
      statusCode: 200,
    };
  }
  if (result.changes) await context.publish(result.changes);
  return {
    body: { outcome: result.outcome, snapshot: result.snapshot },
    statusCode: 200,
  };
}
