// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiV1AuditEntryDto,
  ApiV1CommandResultDto,
  ApiV1JournalCommandDto,
  ApiV1PrincipalDto,
  ApiV1TodoCommandDto,
  ApiV1WorkspaceCommandDto,
} from "../../../contracts/api/types.ts";
import { apiV1NotFound } from "./apiV1Errors.ts";
import { executeApiV1JournalCommand } from "./apiV1JournalCommands.ts";
import { executeApiV1TodoCommand } from "./apiV1TodoCommands.ts";
import { executeApiV1WorkspaceCommand } from "./apiV1WorkspaceCommands.ts";
import { ApiV1EventHub } from "./apiV1Events.ts";
import { ApiV1RevisionTracker } from "./apiV1RevisionTracker.ts";
import {
  assertRepositoryAllowed,
  assertScope,
  createCheckpoint,
  requireBuiltInCatalog,
  type ApiV1HandlerContext,
} from "./apiV1HandlerContext.ts";
import {
  readApiV1RuntimeNow,
  type ApiV1Runtime,
} from "./apiV1Runtime.ts";
import { ApiV1StateStore } from "../repository/apiV1StateStore.ts";

type ApiV1DomainCommandDto =
  | ApiV1JournalCommandDto
  | ApiV1TodoCommandDto
  | ApiV1WorkspaceCommandDto;

function assertDeleteScope(
  principal: ApiV1PrincipalDto,
  command: ApiV1DomainCommandDto,
) {
  if (
    command.kind === "delete-entry"
  ) {
    assertScope(principal, "journal:delete");
  } else if (
    command.kind === "delete-collection"
  ) {
    assertScope(principal, "todo:delete");
  } else if (
    command.kind === "delete-folder" ||
    command.kind === "delete-note"
  ) {
    assertScope(principal, "workspace:delete");
  }
}

function commandRecord(command: ApiV1DomainCommandDto) {
  return command as unknown as Record<string, unknown>;
}

function expectedVersions(command: ApiV1DomainCommandDto) {
  return Object.fromEntries(
    Object.entries(commandRecord(command))
      .filter(([key, value]) =>
        key.startsWith("expected") &&
        typeof value === "string" &&
        value.startsWith("sha256:")
      )
      .map(([key, value]) => [key, value]),
  ) as ApiV1AuditEntryDto["beforeVersions"];
}

function resultingVersions(result: ApiV1CommandResultDto) {
  return Object.fromEntries(
    result.changes.resources.flatMap(({ resourceId, version }) =>
      version ? [[resourceId, version]] : []
    ),
  );
}

function commandResourceIds(command: ApiV1DomainCommandDto) {
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
  command,
  principal,
  requestId,
  result,
  timestamp,
}: {
  command: ApiV1DomainCommandDto;
  principal: ApiV1PrincipalDto;
  requestId: string;
  result: ApiV1CommandResultDto | null;
  timestamp: string;
}): ApiV1AuditEntryDto {
  return {
    afterVersions: result ? resultingVersions(result) : {},
    beforeVersions: expectedVersions(command),
    blockIds: result
      ? [...new Set(result.changes.blocks.map(({ blockId }) => blockId))]
      : "blockId" in command && typeof command.blockId === "string"
        ? [command.blockId]
        : [],
    commandId: command.commandId,
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
  command,
  execute,
  eventHub,
  onCommitted,
  principal,
  requestId,
  stateStore,
  revisionTracker,
  runtime,
}: {
  command: {
    commandId: string;
    kind: string;
    mode: "commit" | "preview";
  } & ApiV1DomainCommandDto;
  eventHub: ApiV1EventHub;
  execute(): Promise<ApiV1CommandResultDto>;
  onCommitted(revision: `sha256:${string}`): void;
  principal: ApiV1PrincipalDto;
  requestId: string;
  runtime: ApiV1Runtime;
  revisionTracker: ApiV1RevisionTracker;
  stateStore: ApiV1StateStore;
}) {
  assertDeleteScope(principal, command);
  if (command.mode === "preview") return execute();
  const { replayed, result } = await stateStore.runIdempotentCommand(
    principal.id,
    command.commandId,
    command,
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
            command,
            principal,
            requestId,
            result: null,
            timestamp: readApiV1RuntimeNow(runtime).timestamp,
          }));
        }
        throw error;
      }
    },
    principal.kind === "automation"
      ? (committed) =>
        auditEntry({
          command,
          principal,
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

export async function handleApiV1Command(context: ApiV1HandlerContext) {
  const input = await context.readJsonBody();

  if (context.route.kind === "workspace-command") {
    const repositoryId = context.route.repositoryId;

    if (!repositoryId) apiV1NotFound();
    assertRepositoryAllowed(context.principal, repositoryId);
    const command = input as ApiV1WorkspaceCommandDto;
    const store = await context.catalog.getStore(repositoryId);
    const result = await executeCommand({
      command,
      eventHub: context.eventHub,
      execute: () =>
        executeApiV1WorkspaceCommand({
          command,
          repositoryId,
          runtime: context.runtime,
          store,
        }),
      principal: context.principal,
      onCommitted: (revision) =>
        context.revisionTracker.observeWorkspace(repositoryId, revision),
      requestId: context.requestId,
      revisionTracker: context.revisionTracker,
      runtime: context.runtime,
      stateStore: context.stateStore,
    });

    return { body: result, statusCode: 200 };
  }
  const catalog = requireBuiltInCatalog(context.builtInCatalog);

  if (context.route.kind === "journal-command") {
    const command = input as ApiV1JournalCommandDto;
    const store = await catalog.getStore("journal");
    const result = await executeCommand({
      command,
      eventHub: context.eventHub,
      execute: () =>
        executeApiV1JournalCommand({
          command,
          runtime: context.runtime,
          store,
        }),
      principal: context.principal,
      onCommitted: (revision) =>
        context.revisionTracker.observeDomain("journal", revision),
      requestId: context.requestId,
      revisionTracker: context.revisionTracker,
      runtime: context.runtime,
      stateStore: context.stateStore,
    });

    return { body: result, statusCode: 200 };
  }
  const command = input as ApiV1TodoCommandDto;
  const store = await catalog.getStore("todo");
  const result = await executeCommand({
    command,
    eventHub: context.eventHub,
    execute: () =>
      executeApiV1TodoCommand({
        command,
        runtime: context.runtime,
        store,
      }),
    principal: context.principal,
    onCommitted: (revision) =>
      context.revisionTracker.observeDomain("todo", revision),
    requestId: context.requestId,
    revisionTracker: context.revisionTracker,
    runtime: context.runtime,
    stateStore: context.stateStore,
  });

  return { body: result, statusCode: 200 };
}
