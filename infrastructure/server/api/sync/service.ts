// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  JournalContentDto,
  JournalSyncRequestDto,
} from "../../../../contracts/journal/index.ts";
import type {
  TodoContentDto,
  TodoSyncRequestDto,
} from "../../../../contracts/todo/index.ts";
import type { DomainChangeSetDto } from "../../../../contracts/common/index.ts";
import type {
  WorkspaceRepositorySyncRequestDto,
} from "../../../../contracts/workspace/index.ts";
import type {
  VersionedContentStore,
  WorkspaceRepositoryStore,
} from "../../repository/index.ts";
import type { JournalParseIndex } from "../../../../core/journal/index.ts";
import type { TodoParseIndex } from "../../../../core/todo/index.ts";

import {
  executeSnapshotSync,
  SnapshotSyncBaseRevisionError,
  SnapshotSyncMergeConflictError,
  SnapshotSyncRevisionConflictError,
  SnapshotSyncRetryExhaustedError,
} from "../../../../application/sync/index.ts";
import {
  prepareWorkspaceWriteContent,
  prepareJournalWriteContent,
  prepareTodoWriteContent,
  createWorkspaceRepositoryRevision,
  createJournalRevision,
  createTodoRevision,
} from "../../repository/index.ts";


import {
  projectJournalContentChanges,
  mergeJournalContent,
} from "../../../../application/journal/index.ts";
import type {
  JournalDomainVersions,
} from "../../../../application/journal/index.ts";
import type { CommandRuntime } from "../../../../application/commands/index.ts";
import {
  projectTodoContentChanges,
  mergeTodoContent,
} from "../../../../application/todo/index.ts";
import type {
  TodoDomainVersions,
} from "../../../../application/todo/index.ts";
import {
  projectWorkspaceContentChanges,
  mergeWorkspaceContent,
  WorkspaceRevisionConflictError,
} from "../../../../application/workspace/index.ts";
import type { WorkspaceResourceVersionPolicy } from "../../../../application/workspace/index.ts";







import { VersionedContentRevisionConflictError } from "../../../../application/persistence/index.ts";
import { ApiRequestError } from "../protocol/index.ts";

export type ApiSyncResult = {
  audit: null | {
    afterRevision: `sha256:${string}`;
    changeMetadata: { blockIds: string[]; resourceIds: string[] };
    outcome: "auto-merged" | "committed" | "unchanged";
  };
  body: unknown;
  statusCode: number;
};

type ApiSyncContext = {
  mode: "commit" | "load";
  observeRevision(revision: `sha256:${string}`): void;
  publish(changes: DomainChangeSetDto): Promise<void>;
  readJsonBody(): Promise<unknown>;
  runtime: CommandRuntime;
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
      audit: null,
      body: result.snapshot,
      statusCode: 200,
    };
  }
  if (result.changes) await context.publish(result.changes);
  return {
    audit: {
      afterRevision: result.snapshot.revision,
      changeMetadata: {
        blockIds: result.changes?.blocks.map(({ blockId }) => blockId) ?? [],
        resourceIds: result.changes?.resources.map(({ resourceId }) => resourceId) ?? [],
      },
      outcome: result.outcome,
    },
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
      audit: null,
      body: result.snapshot,
      statusCode: 200,
    };
  }
  if (result.changes) await context.publish(result.changes);
  return {
    audit: {
      afterRevision: result.snapshot.revision,
      changeMetadata: {
        blockIds: result.changes?.blocks.map(({ blockId }) => blockId) ?? [],
        resourceIds: result.changes?.resources.map(({ resourceId }) => resourceId) ?? [],
      },
      outcome: result.outcome,
    },
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
      audit: null,
      body: result.snapshot,
      statusCode: 200,
    };
  }
  if (result.changes) await context.publish(result.changes);
  return {
    audit: {
      afterRevision: result.snapshot.revision,
      changeMetadata: {
        blockIds: result.changes?.blocks.map(({ blockId }) => blockId) ?? [],
        resourceIds: result.changes?.resources.map(({ resourceId }) => resourceId) ?? [],
      },
      outcome: result.outcome,
    },
    body: { outcome: result.outcome, snapshot: result.snapshot },
    statusCode: 200,
  };
}
