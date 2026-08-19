// SPDX-License-Identifier: GPL-3.0-or-later

import { createApiOpenApiDocument } from "../../../../contracts/api/openApi.ts";
import type { ApiSearchRequestDto } from "../../../../contracts/api/types.ts";
import type { WorkspaceRepositoryCatalog } from "../../repository/catalog.ts";
import type { ApiBuiltInCatalog } from "./ports.ts";
import { ApiRequestError } from "./errors.ts";
import {
  assertOperationScopes,
  createCheckpoint,
  requireBuiltInCatalog,
  type ApiHandlerContext,
  type HandlerResult,
} from "./handlerContext.ts";
import {
  handleJournalQuery,
  handleTodoQuery,
  handleWorkspaceQuery,
} from "./queryHandlers.ts";
import { handleApiCommand } from "../commands/handler.ts";
import { handleApiSync } from "../sync/handlers.ts";
import {
  journalResourceVersions,
  todoResourceVersions,
  workspaceResourceVersions,
} from "../resources/versions.ts";
import {
  handleRepositoryAdmin,
  handleTokenAdmin,
  parseAuditQuery,
} from "./adminHandlers.ts";
import { ApiSearchService } from "../search.ts";

export async function handleApiRoute(
  context: ApiHandlerContext,
): Promise<HandlerResult | null> {
  assertOperationScopes(context.principal, context.operation);
  const { operation, route } = context;

  if (operation.operationId === "getHealth") {
    return { body: { ok: true }, statusCode: 200 };
  }
  if (operation.operationId === "getCapabilities") {
    return {
      body: { apiVersion: 2, principal: context.principal },
      statusCode: 200,
    };
  }
  if (operation.operationId === "getOpenApi") {
    return { body: createApiOpenApiDocument(), statusCode: 200 };
  }
  if (operation.operationId === "streamEvents") {
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
  if (operation.operationId === "searchContent") {
    const search = context.search;

    if (!search) {
      throw new ApiRequestError(
        "adapter_unavailable",
        "Search is unavailable",
      );
    }
    return {
      body: await search.search(
        await context.readJsonBody() as ApiSearchRequestDto,
        context.principal,
      ),
      statusCode: 200,
    };
  }
  if ([
    "listWorkspaces",
    "getWorkspaceTree",
    "getWorkspaceNote",
  ].includes(operation.operationId)) {
    return handleWorkspaceQuery(context);
  }
  if (["listJournalEntries", "getJournalEntry"].includes(
    operation.operationId,
  )) {
    return handleJournalQuery(context);
  }
  if (["listTodoCollections", "getTodoCollection"].includes(
    operation.operationId,
  )) {
    return handleTodoQuery(context);
  }
  if ([
    "executeWorkspaceCommand",
    "executeJournalCommand",
    "executeTodoCommand",
  ].includes(operation.operationId)) {
    return handleApiCommand(context);
  }
  if ([
    "getWorkspaceSyncSnapshot",
    "putWorkspaceSyncSnapshot",
    "getJournalSyncSnapshot",
    "putJournalSyncSnapshot",
    "getTodoSyncSnapshot",
    "putTodoSyncSnapshot",
  ].includes(operation.operationId)) {
    return handleApiSync(context, {
      journal: journalResourceVersions,
      todo: todoResourceVersions,
      workspace: workspaceResourceVersions,
    });
  }
  if ([
    "listAdminRepositories",
    "createAdminRepository",
    "renameAdminRepository",
    "deleteAdminRepository",
  ].includes(operation.operationId)) {
    return handleRepositoryAdmin(context);
  }
  if (operation.operationId === "listBuiltIns") {
    return {
      body: await requireBuiltInCatalog(context.builtInCatalog).listBuiltIns(),
      statusCode: 200,
    };
  }
  if (operation.operationId === "retryBuiltIn") {
    return {
      body: await requireBuiltInCatalog(context.builtInCatalog).retry(
        route.builtInId,
      ),
      statusCode: 200,
    };
  }
  if (["listApiTokens", "createApiToken", "revokeToken"].includes(
    operation.operationId,
  )) {
    return handleTokenAdmin(context);
  }
  if (operation.operationId === "listAuditEntries") {
    return {
      body: await context.stateStore.listAudit(parseAuditQuery(context.query)),
      statusCode: 200,
    };
  }
  throw new ApiRequestError("not_found", "Not found");
}

export function createApiSearchService({
  builtInCatalog,
  catalog,
}: {
  builtInCatalog?: ApiBuiltInCatalog;
  catalog: WorkspaceRepositoryCatalog;
}) {
  return builtInCatalog
    ? new ApiSearchService({ builtInCatalog, catalog })
    : null;
}
