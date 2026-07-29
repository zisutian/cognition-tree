// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import { createApiV1OpenApiDocument } from "../../../contracts/api/openApi.ts";
import { apiV1AutomationScopes } from "../../../contracts/api/types.ts";
import type {
  ApiV1AuditEntryDto,
  ApiV1CommandResultDto,
  ApiV1CreateTokenRequestDto,
  ApiV1DomainChangeSetDto,
  ApiV1JournalCommandDto,
  ApiV1PrincipalDto,
  ApiV1RevisionCheckpointDto,
  ApiV1SearchRequestDto,
  ApiV1Scope,
  ApiV1TodoCommandDto,
  ApiV1WorkspaceCommandDto,
} from "../../../contracts/api/types.ts";
import {
  parseRepositoryDeletionMode,
} from "../../../contracts/workspace/parseCatalog.ts";
import type {
  CreateRepositoryDto,
  RenameRepositoryDto,
} from "../../../contracts/workspace/types.ts";
import { parseJournalContent } from "../../../contracts/journal/parseJournal.ts";
import { parseTodoContent } from "../../../contracts/todo/parseTodo.ts";
import {
  isJournalEntryId,
} from "../../../core/journal/model/journalContent.ts";
import {
  isTodoCollectionId,
} from "../../../core/todo/model/todoContent.ts";
import type {
  WorkspaceRepositoryCatalog,
} from "../repository/repositoryCatalog.ts";
import type {
  ApiV1BuiltInCatalog,
} from "./apiV1Ports.ts";
import {
  ApiV1RequestError,
  apiV1NotFound,
} from "./apiV1Errors.ts";
import type {
  ResolvedApiV1Route,
} from "../../../contracts/api/registry.ts";
import {
  getApiV1RouteOperation,
} from "../../../contracts/api/registry.ts";
import {
  executeApiV1JournalCommand,
} from "./apiV1JournalCommands.ts";
import {
  executeApiV1TodoCommand,
} from "./apiV1TodoCommands.ts";
import {
  executeApiV1WorkspaceCommand,
} from "./apiV1WorkspaceCommands.ts";
import { ApiV1EventHub } from "./apiV1Events.ts";
import {
  ApiV1RevisionTracker,
  type ApiV1TrackedDomain,
} from "./apiV1RevisionTracker.ts";
import {
  createApiV1JournalIndex,
  createApiV1TodoIndex,
  createApiV1WorkspaceAnalysis,
  projectApiV1JournalEntries,
  projectApiV1JournalEntry,
  projectApiV1TodoCollection,
  projectApiV1TodoCollections,
  projectApiV1WorkspaceNote,
  projectApiV1WorkspaceTree,
} from "./apiV1Resources.ts";
import {
  readApiV1RuntimeNow,
  type ApiV1Runtime,
} from "./apiV1Runtime.ts";
import { ApiV1SearchService } from "./apiV1Search.ts";
import { ApiV1StateStore } from "../repository/apiV1StateStore.ts";
import {
  synchronizeApiV1Journal,
  synchronizeApiV1Todo,
  synchronizeApiV1Workspace,
} from "./apiV1Sync.ts";

type HandlerResult = {
  body: unknown;
  statusCode: number;
};

type ApiV1DomainCommandDto =
  | ApiV1JournalCommandDto
  | ApiV1TodoCommandDto
  | ApiV1WorkspaceCommandDto;

const automationTokenScopes = new Set<ApiV1Scope>(apiV1AutomationScopes);

function requireBuiltInCatalog(
  catalog: ApiV1BuiltInCatalog | undefined,
): ApiV1BuiltInCatalog {
  if (!catalog) {
    throw new ApiV1RequestError(
      "adapter_unavailable",
      "Built-in data catalog is unavailable",
    );
  }
  return catalog;
}

function assertScope(principal: ApiV1PrincipalDto, scope: ApiV1Scope) {
  if (!principal.scopes.includes(scope)) {
    throw new ApiV1RequestError(
      "forbidden",
      `Required API scope is missing: ${scope}`,
    );
  }
}

function assertRouteScopes(
  principal: ApiV1PrincipalDto,
  route: ResolvedApiV1Route,
  method: string,
) {
  const operation = getApiV1RouteOperation(route, method);

  for (const scope of operation.scopes) {
    assertScope(principal, scope);
  }
  if (
    operation.anyScopes.length > 0 &&
    !operation.anyScopes.some((scope) => principal.scopes.includes(scope))
  ) {
    throw new ApiV1RequestError(
      "forbidden",
      `One readable API scope is required: ${operation.anyScopes.join(", ")}`,
    );
  }
}

function assertRepositoryAllowed(
  principal: ApiV1PrincipalDto,
  repositoryId: string,
) {
  if (
    principal.repositoryIds !== null &&
    !principal.repositoryIds.includes(repositoryId)
  ) {
    throw new ApiV1RequestError(
      "forbidden",
      "Token is not allowed to access this repository",
    );
  }
}

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

function createCheckpoint({
  eventHub,
  revisionTracker,
}: {
  eventHub: ApiV1EventHub;
  revisionTracker: ApiV1RevisionTracker;
}): ApiV1RevisionCheckpointDto {
  return revisionTracker.checkpoint({
    sequence: eventHub.sequence,
    streamId: eventHub.streamId,
  });
}

type ApiV1HandlerContext = {
  builtInCatalog?: ApiV1BuiltInCatalog;
  catalog: WorkspaceRepositoryCatalog;
  eventHub: ApiV1EventHub;
  method: string;
  principal: ApiV1PrincipalDto;
  query: unknown;
  readJsonBody(): Promise<unknown>;
  requestId: string;
  response: ServerResponse;
  responseHeaders: OutgoingHttpHeaders;
  revisionTracker: ApiV1RevisionTracker;
  route: ResolvedApiV1Route;
  runtime: ApiV1Runtime;
  search: ApiV1SearchService | null;
  stateStore: ApiV1StateStore;
};

function publishTrackedChanges(
  context: Pick<
    ApiV1HandlerContext,
    "eventHub" | "revisionTracker"
  >,
  changes: ApiV1DomainChangeSetDto,
) {
  context.eventHub.publish(
    createCheckpoint(context),
    changes,
  );
}

function observeWorkspaceRevision(
  context: ApiV1HandlerContext,
  repositoryId: string,
  revision: `sha256:${string}`,
) {
  if (
    context.revisionTracker.observeWorkspace(repositoryId, revision) !==
      "changed"
  ) {
    return;
  }
  publishTrackedChanges(context, {
    blocks: [],
    occurredAt: readApiV1RuntimeNow(context.runtime).timestamp,
    resources: [{
      domain: "workspace",
      kind: "updated",
      repositoryId,
      resourceId: repositoryId,
      version: revision,
    }],
  });
}

function observeBuiltInRevision(
  context: ApiV1HandlerContext,
  domain: ApiV1TrackedDomain,
  revision: `sha256:${string}`,
) {
  if (
    context.revisionTracker.observeDomain(domain, revision) !== "changed"
  ) {
    return;
  }
  publishTrackedChanges(context, {
    blocks: [],
    occurredAt: readApiV1RuntimeNow(context.runtime).timestamp,
    resources: [{
      domain,
      kind: "updated",
      resourceId: domain,
      version: revision,
    }],
  });
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

async function handleWorkspaceQuery(context: ApiV1HandlerContext) {
  const { catalog, principal, route } = context;

  if (route.kind === "workspaces") {
    const repositories = await catalog.listRepositories();
    const visibleRepositories = repositories.repositories.filter(
      ({ adapter }) => adapter !== "browser",
    );
    const removed = context.revisionTracker.reconcileWorkspaceIds(
      new Set(visibleRepositories.map(({ id }) => id)),
    );

    if (removed.length > 0) {
      publishTrackedChanges(context, {
        blocks: [],
        occurredAt: readApiV1RuntimeNow(context.runtime).timestamp,
        resources: removed.map((repositoryId) => ({
          domain: "workspace",
          kind: "deleted",
          repositoryId,
          resourceId: repositoryId,
        })),
      });
    }
    return {
      body: {
        workspaces: visibleRepositories
          .filter(({ id }) =>
            (principal.repositoryIds === null ||
              principal.repositoryIds.includes(id))
          )
          .map(({ adapter, id, label }) => ({ adapter, id, label })),
      },
      statusCode: 200,
    };
  }
  const repositoryId = route.repositoryId;

  if (!repositoryId) apiV1NotFound();
  assertRepositoryAllowed(principal, repositoryId);
  const snapshot = await catalog.getStore(repositoryId)
    .then((store) => store.loadSnapshot());
  observeWorkspaceRevision(context, repositoryId, snapshot.revision);
  const analysis = createApiV1WorkspaceAnalysis(snapshot.content);

  if (route.kind === "workspace-tree") {
    return {
      body: projectApiV1WorkspaceTree(
        repositoryId,
        snapshot.revision,
        analysis,
      ),
      statusCode: 200,
    };
  }
  const note = route.noteId
    ? projectApiV1WorkspaceNote(analysis, route.noteId)
    : null;

  if (!note) apiV1NotFound("Workspace note does not exist");
  return { body: note, statusCode: 200 };
}

async function handleJournalQuery(context: ApiV1HandlerContext) {
  const catalog = requireBuiltInCatalog(context.builtInCatalog);
  const snapshot = await catalog.getStore("journal").then((store) =>
    store.loadSnapshot()
  );
  observeBuiltInRevision(context, "journal", snapshot.revision);
  const content = parseJournalContent(snapshot.content);
  const index = createApiV1JournalIndex(content);

  if (context.route.kind === "journal-entries") {
    return {
      body: projectApiV1JournalEntries(content, index, snapshot.revision),
      statusCode: 200,
    };
  }
  const entry = context.route.entryId
    && isJournalEntryId(context.route.entryId)
    ? index.getParsedEntry(context.route.entryId)
    : null;

  if (!entry) apiV1NotFound("Journal entry does not exist");
  return { body: projectApiV1JournalEntry(entry), statusCode: 200 };
}

async function handleTodoQuery(context: ApiV1HandlerContext) {
  const catalog = requireBuiltInCatalog(context.builtInCatalog);
  const snapshot = await catalog.getStore("todo").then((store) =>
    store.loadSnapshot()
  );
  observeBuiltInRevision(context, "todo", snapshot.revision);
  const content = parseTodoContent(snapshot.content);
  const index = createApiV1TodoIndex(content);

  if (context.route.kind === "todo-collections") {
    return {
      body: projectApiV1TodoCollections(content, index, snapshot.revision),
      statusCode: 200,
    };
  }
  const collection = context.route.collectionId
    && isTodoCollectionId(context.route.collectionId)
    ? index.getParsedCollection(context.route.collectionId)
    : null;

  if (!collection) apiV1NotFound("Todo collection does not exist");
  const { date } = readApiV1RuntimeNow(context.runtime);

  return {
    body: projectApiV1TodoCollection(
      collection,
      context.runtime.today(date),
    ),
    statusCode: 200,
  };
}

async function handleCommand(context: ApiV1HandlerContext) {
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

async function publishApiV1Changes(
  context: ApiV1HandlerContext,
  changes: ApiV1DomainChangeSetDto,
) {
  publishTrackedChanges(context, changes);
}

async function handleWorkspaceSync(
  context: ApiV1HandlerContext,
  repositoryId: string,
) {
  assertRepositoryAllowed(context.principal, repositoryId);
  const store = await context.catalog.getStore(repositoryId);
  return synchronizeApiV1Workspace({
    method: context.method,
    observeRevision: (revision) =>
      context.revisionTracker.observeWorkspace(repositoryId, revision),
    publish: (changes) => publishApiV1Changes(context, changes),
    readJsonBody: context.readJsonBody,
    repositoryId,
    runtime: context.runtime,
    store,
  });
}

async function handleJournalSync(context: ApiV1HandlerContext) {
  const store = await requireBuiltInCatalog(context.builtInCatalog)
    .getStore("journal");

  return synchronizeApiV1Journal({
    method: context.method,
    observeRevision: (revision) =>
      context.revisionTracker.observeDomain("journal", revision),
    publish: (changes) => publishApiV1Changes(context, changes),
    readJsonBody: context.readJsonBody,
    runtime: context.runtime,
    store,
  });
}

async function handleTodoSync(context: ApiV1HandlerContext) {
  const store = await requireBuiltInCatalog(context.builtInCatalog)
    .getStore("todo");

  return synchronizeApiV1Todo({
    method: context.method,
    observeRevision: (revision) =>
      context.revisionTracker.observeDomain("todo", revision),
    publish: (changes) => publishApiV1Changes(context, changes),
    readJsonBody: context.readJsonBody,
    runtime: context.runtime,
    store,
  });
}

function handleSync(context: ApiV1HandlerContext) {
  if (context.route.kind === "sync-workspace") {
    const repositoryId = context.route.repositoryId;

    if (!repositoryId) apiV1NotFound();
    return handleWorkspaceSync(context, repositoryId);
  }
  return context.route.kind === "sync-journal"
    ? handleJournalSync(context)
    : handleTodoSync(context);
}

async function handleRepositoryAdmin(context: ApiV1HandlerContext) {
  const { catalog, method, route } = context;

  if (route.kind === "admin-repositories") {
    if (method === "GET") {
      return { body: await catalog.listRepositories(), statusCode: 200 };
    }
    const descriptor = await catalog.createRepository(
      await context.readJsonBody() as CreateRepositoryDto,
    );
    const revision = await catalog.getStore(descriptor.id)
      .then((store) => store.loadSnapshot())
      .then((snapshot) => snapshot.revision);

    context.revisionTracker.observeWorkspace(descriptor.id, revision);
    await publishApiV1Changes(context, {
      blocks: [],
      occurredAt: readApiV1RuntimeNow(context.runtime).timestamp,
      resources: [{
        domain: "workspace",
        kind: "created",
        repositoryId: descriptor.id,
        resourceId: descriptor.id,
        version: revision,
      }],
    });
    return { body: descriptor, statusCode: 201 };
  }
  const repositoryId = route.repositoryId ?? "";

  if (method === "PATCH") {
    const descriptor = await catalog.renameRepository(
      repositoryId,
      await context.readJsonBody() as RenameRepositoryDto,
    );
    const revision = await catalog.getStore(repositoryId)
      .then((store) => store.loadSnapshot())
      .then((snapshot) => snapshot.revision);

    context.revisionTracker.observeWorkspace(repositoryId, revision);
    await publishApiV1Changes(context, {
      blocks: [],
      occurredAt: readApiV1RuntimeNow(context.runtime).timestamp,
      resources: [{
        domain: "workspace",
        kind: "updated",
        repositoryId,
        resourceId: repositoryId,
        version: revision,
      }],
    });
    return { body: descriptor, statusCode: 200 };
  }
  const query = context.query as {
    mode: "delete-managed-data" | "remove-connection";
  };
  const result = await catalog.deleteRepository(
    repositoryId,
    parseRepositoryDeletionMode(query.mode),
  );

  context.revisionTracker.removeWorkspace(repositoryId);
  await publishApiV1Changes(context, {
    blocks: [],
    occurredAt: readApiV1RuntimeNow(context.runtime).timestamp,
    resources: [{
      domain: "workspace",
      kind: "deleted",
      repositoryId,
      resourceId: repositoryId,
    }],
  });
  return {
    body: result,
    statusCode: result.status === "deleting" ? 202 : 200,
  };
}

async function handleTokenAdmin(context: ApiV1HandlerContext) {
  const { method, route, stateStore } = context;

  if (route.kind === "admin-tokens") {
    if (method === "GET") {
      return { body: { tokens: await stateStore.listTokens() }, statusCode: 200 };
    }
    const request =
      await context.readJsonBody() as ApiV1CreateTokenRequestDto;

    if (
      request.scopes.length === 0 ||
      request.scopes.some((scope) => !automationTokenScopes.has(scope))
    ) {
      throw new ApiV1RequestError(
        "domain_validation_failed",
        "Automation tokens may only use domain read, write, and delete scopes",
      );
    }
    for (const domain of ["workspace", "journal", "todo"] as const) {
      if (
        request.scopes.includes(`${domain}:delete`) &&
        !request.scopes.includes(`${domain}:write`)
      ) {
        throw new ApiV1RequestError(
          "domain_validation_failed",
          `${domain}:delete requires ${domain}:write`,
        );
      }
    }
    if (request.repositoryIds) {
      const catalog = await context.catalog.listRepositories();
      const knownIds = new Set(catalog.repositories.map(({ id }) => id));

      for (const id of request.repositoryIds) {
        if (!knownIds.has(id)) {
          throw new ApiV1RequestError(
            "domain_validation_failed",
            `Repository allowlist contains an unknown repository: ${id}`,
          );
        }
      }
    }
    return {
      body: await stateStore.createToken(request),
      statusCode: 201,
    };
  }
  const tokenId = route.tokenId ?? "";
  const removed = await stateStore.revokeToken(tokenId);

  if (!removed) apiV1NotFound("API token does not exist");
  context.eventHub.revokePrincipal(tokenId);
  return { body: { revoked: true }, statusCode: 200 };
}

function parseAuditQuery(query: unknown) {
  const source = query as { cursor?: number; limit?: number };

  return {
    cursor: source.cursor ?? 0,
    limit: source.limit ?? 50,
  };
}

export async function handleApiV1Route(
  context: ApiV1HandlerContext,
): Promise<HandlerResult | null> {
  assertRouteScopes(context.principal, context.route, context.method);
  const { route } = context;

  if (route.kind === "health") {
    return { body: { ok: true }, statusCode: 200 };
  }
  if (route.kind === "capabilities") {
    return {
      body: { apiVersion: 1, principal: context.principal },
      statusCode: 200,
    };
  }
  if (route.kind === "openapi") {
    return { body: createApiV1OpenApiDocument(), statusCode: 200 };
  }
  if (route.kind === "events") {
    requireBuiltInCatalog(context.builtInCatalog);
    context.eventHub.connect({
      checkpoint: createCheckpoint({
        eventHub: context.eventHub,
        revisionTracker: context.revisionTracker,
      }),
      headers: context.responseHeaders,
      principal: context.principal,
      response: context.response,
    });
    return null;
  }
  if (route.kind === "search") {
    const search = context.search;

    if (!search) {
      throw new ApiV1RequestError(
        "adapter_unavailable",
        "Search is unavailable",
      );
    }
    return {
      body: await search.search(
        await context.readJsonBody() as ApiV1SearchRequestDto,
        context.principal,
      ),
      statusCode: 200,
    };
  }
  if (
    route.kind === "workspaces" ||
    route.kind === "workspace-tree" ||
    route.kind === "workspace-note"
  ) {
    return handleWorkspaceQuery(context);
  }
  if (route.kind === "journal-entries" || route.kind === "journal-entry") {
    return handleJournalQuery(context);
  }
  if (
    route.kind === "todo-collections" ||
    route.kind === "todo-collection"
  ) {
    return handleTodoQuery(context);
  }
  if (
    route.kind === "workspace-command" ||
    route.kind === "journal-command" ||
    route.kind === "todo-command"
  ) {
    return handleCommand(context);
  }
  if (
    route.kind === "sync-workspace" ||
    route.kind === "sync-journal" ||
    route.kind === "sync-todo"
  ) {
    return handleSync(context);
  }
  if (
    route.kind === "admin-repositories" ||
    route.kind === "admin-repository"
  ) {
    return handleRepositoryAdmin(context);
  }
  if (route.kind === "admin-built-ins") {
    return {
      body: await requireBuiltInCatalog(context.builtInCatalog).listBuiltIns(),
      statusCode: 200,
    };
  }
  if (route.kind === "admin-built-in-retry") {
    return {
      body: await requireBuiltInCatalog(context.builtInCatalog).retry(
        route.builtInId,
      ),
      statusCode: 200,
    };
  }
  if (route.kind === "admin-tokens" || route.kind === "admin-token") {
    return handleTokenAdmin(context);
  }
  if (route.kind === "admin-audit") {
    return {
      body: await context.stateStore.listAudit(parseAuditQuery(context.query)),
      statusCode: 200,
    };
  }
  throw new ApiV1RequestError("not_found", "Not found");
}

export function createApiV1SearchService({
  builtInCatalog,
  catalog,
  runtime,
}: {
  builtInCatalog?: ApiV1BuiltInCatalog;
  catalog: WorkspaceRepositoryCatalog;
  runtime: ApiV1Runtime;
}) {
  return builtInCatalog
    ? new ApiV1SearchService({ builtInCatalog, catalog, runtime })
    : null;
}
