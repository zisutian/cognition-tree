// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiAuditEntryDto,
  ApiCommandResultDto,
  ApiJournalCommandRequestDto,
  ApiPrincipalDto,
  ApiTodoCommandRequestDto,
  ApiWorkspaceCommandRequestDto,
} from "../../../../contracts/api/types.ts";
import { apiNotFound } from "../http/errors.ts";
import { executeApiJournalCommand } from "./journal.ts";
import { executeApiTodoCommand } from "./todo.ts";
import { executeApiWorkspaceCommand } from "./workspace.ts";
import { ApiEventHub } from "../sync/events.ts";
import { ApiRevisionTracker } from "../sync/revisionTracker.ts";
import {
  assertRepositoryAllowed,
  assertScope,
  createCheckpoint,
  requireBuiltInCatalog,
  type ApiHandlerContext,
} from "../http/handlerContext.ts";
import {
  readApiRuntimeNow,
  type ApiRuntime,
} from "../http/runtime.ts";
import { ApiStateStore } from "../state/store.ts";

type ApiDomainCommandRequestDto =
  | ApiJournalCommandRequestDto
  | ApiTodoCommandRequestDto
  | ApiWorkspaceCommandRequestDto;
type ApiDomainCommandDto = ApiDomainCommandRequestDto["command"];
type ApiCommittedDomainCommandRequestDto = Extract<
  ApiDomainCommandRequestDto,
  { mode: "commit" }
>;

function assertDeleteScope(
  principal: ApiPrincipalDto,
  command: ApiDomainCommandDto,
) {
  if (command.kind === "delete-entry") {
    assertScope(principal, "journal:delete");
  } else if (command.kind === "delete-collection") {
    assertScope(principal, "todo:delete");
  } else if (
    command.kind === "delete-folder" ||
    command.kind === "delete-note"
  ) {
    assertScope(principal, "workspace:delete");
  }
}

function commandRecord(command: ApiDomainCommandDto) {
  return command as unknown as Record<string, unknown>;
}

function expectedVersions(request: ApiDomainCommandRequestDto) {
  return Object.fromEntries(
    Object.entries(request.preconditions)
      .filter(([, value]) =>
        typeof value === "string" && value.startsWith("sha256:")
      ),
  ) as ApiAuditEntryDto["beforeVersions"];
}

function resultingVersions(result: ApiCommandResultDto) {
  return Object.fromEntries(
    result.changes.resources.flatMap(({ resourceId, version }) =>
      version ? [[resourceId, version]] : []
    ),
  );
}

function commandResourceIds(command: ApiDomainCommandDto) {
  const record = commandRecord(command);

  return [
    "blockId",
    "collectionId",
    "entryId",
    "folderId",
    "noteId",
    "sourceNoteId",
    "targetNoteId",
  ].flatMap((key) =>
    typeof record[key] === "string" ? [record[key] as string] : []
  );
}

function auditEntry({
  principal,
  request,
  requestId,
  result,
  timestamp,
}: {
  principal: ApiPrincipalDto;
  request: ApiCommittedDomainCommandRequestDto;
  requestId: string;
  result: ApiCommandResultDto | null;
  timestamp: string;
}): ApiAuditEntryDto {
  const { command } = request;

  return {
    afterVersions: result ? resultingVersions(result) : {},
    beforeVersions: expectedVersions(request),
    blockIds: result
      ? [...new Set(result.changes.blocks.map(({ blockId }) => blockId))]
      : "blockId" in command && typeof command.blockId === "string"
        ? [command.blockId]
        : [],
    commandId: request.commandId,
    commandKind: command.kind,
    occurredAt: timestamp,
    principalId: principal.id,
    requestId,
    resourceIds: result
      ? [...new Set(result.changes.resources.map(({ resourceId }) => resourceId))]
      : commandResourceIds(command),
    result: result ? "committed" : "failed",
  };
}

async function executeCommand({
  eventHub,
  execute,
  onCommitted,
  principal,
  request,
  requestId,
  stateStore,
  revisionTracker,
  runtime,
}: {
  eventHub: ApiEventHub;
  execute(): Promise<ApiCommandResultDto>;
  onCommitted(revision: `sha256:${string}`): void;
  principal: ApiPrincipalDto;
  request: ApiDomainCommandRequestDto;
  requestId: string;
  runtime: ApiRuntime;
  revisionTracker: ApiRevisionTracker;
  stateStore: ApiStateStore;
}) {
  assertDeleteScope(principal, request.command);
  if (request.mode === "preview") return execute();
  const { replayed, result } = await stateStore.runIdempotentCommand(
    principal.id,
    request.commandId,
    request,
    async () => {
      try {
        const committed = await execute();

        if (committed.status !== "committed") {
          throw new Error("Commit command returned a preview response.");
        }
        return committed;
      } catch (error) {
        if (principal.kind === "automation") {
          await stateStore.appendAudit(auditEntry({
            principal,
            request,
            requestId,
            result: null,
            timestamp: readApiRuntimeNow(runtime).timestamp,
          }));
        }
        throw error;
      }
    },
    principal.kind === "automation"
      ? (committed) =>
        auditEntry({
          principal,
          request,
          requestId,
          result: committed,
          timestamp: committed.changes.occurredAt,
        })
      : undefined,
  );

  if (!replayed) {
    onCommitted(result.revision);
    eventHub.publish(
      createCheckpoint({ eventHub, revisionTracker }),
      result.changes,
    );
  }
  return result;
}

export async function handleApiCommand(context: ApiHandlerContext) {
  const input = await context.readJsonBody();

  if (context.operation.operationId === "executeWorkspaceCommand") {
    const repositoryId = context.route.repositoryId;

    if (!repositoryId) apiNotFound();
    assertRepositoryAllowed(context.principal, repositoryId);
    const request = input as ApiWorkspaceCommandRequestDto;
    const store = await context.catalog.getStore(repositoryId);
    const result = await executeCommand({
      eventHub: context.eventHub,
      execute: () =>
        executeApiWorkspaceCommand({
          repositoryId,
          request,
          runtime: context.runtime,
          store,
        }),
      principal: context.principal,
      onCommitted: (revision) =>
        context.revisionTracker.observeWorkspace(repositoryId, revision),
      request,
      requestId: context.requestId,
      revisionTracker: context.revisionTracker,
      runtime: context.runtime,
      stateStore: context.stateStore,
    });

    return { body: result, statusCode: 200 };
  }
  const catalog = requireBuiltInCatalog(context.builtInCatalog);

  if (context.operation.operationId === "executeJournalCommand") {
    const request = input as ApiJournalCommandRequestDto;
    const store = await catalog.getStore("journal");
    const result = await executeCommand({
      eventHub: context.eventHub,
      execute: () =>
        executeApiJournalCommand({
          request,
          runtime: context.runtime,
          store,
        }),
      principal: context.principal,
      onCommitted: (revision) =>
        context.revisionTracker.observeDomain("journal", revision),
      request,
      requestId: context.requestId,
      revisionTracker: context.revisionTracker,
      runtime: context.runtime,
      stateStore: context.stateStore,
    });

    return { body: result, statusCode: 200 };
  }
  const request = input as ApiTodoCommandRequestDto;
  const store = await catalog.getStore("todo");
  const result = await executeCommand({
    eventHub: context.eventHub,
    execute: () =>
      executeApiTodoCommand({
        request,
        runtime: context.runtime,
        store,
      }),
    principal: context.principal,
    onCommitted: (revision) =>
      context.revisionTracker.observeDomain("todo", revision),
    request,
    requestId: context.requestId,
    revisionTracker: context.revisionTracker,
    runtime: context.runtime,
    stateStore: context.stateStore,
  });

  return { body: result, statusCode: 200 };
}
