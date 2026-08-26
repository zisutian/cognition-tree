// SPDX-License-Identifier: GPL-3.0-or-later

import { createApiOpenApiDocument } from "../../../../contracts/api/openApi.ts";
import type { ApiSearchRequestDto } from "../../../../contracts/api/types.ts";
import type { WorkspaceRepositoryCatalog } from "../../repository/catalog.ts";
import type { ApiBuiltInCatalog } from "./ports.ts";
import { ApiRequestError } from "./errors.ts";
import {
  assertOperationAccess,
  createCheckpoint,
  requireBuiltInCatalog,
  type ApiHandlerContext,
  type ApiRouteHandlerContext,
  type HandlerResult,
} from "./handlerContext.ts";
import { handleAgentOperation } from "./agentHandlers.ts";
import {
  handleJournalQuery,
  handleTodoQuery,
  handleWorkspaceQuery,
} from "./queryHandlers.ts";
import { handleApiSync } from "../sync/handlers.ts";
import {
  journalResourceVersions,
  todoResourceVersions,
  workspaceResourceVersions,
} from "../resources/versions.ts";
import {
  handleAgentConfigurationAdmin,
  handleRepositoryAdmin,
  handleTokenAdmin,
  parseAuditQuery,
} from "./adminHandlers.ts";
import { ApiSearchService } from "../search.ts";
import {
  handleOwnerSession,
  handleSystemAdministration,
} from "./systemHandlers.ts";

export async function handleApiRoute(
  context: ApiRouteHandlerContext,
): Promise<HandlerResult | null> {
  assertOperationAccess(context.principal, context.operation);
  const { operation, route } = context;

  if (operation.operationId === "getHealth") {
    return { body: { ok: true }, statusCode: 200 };
  }
  if (operation.operationId === "getCapabilities") {
    const exposesAuditStatus = context.principal?.kind === "local-owner" ||
      context.principal?.kind === "owner";
    const auditStatus = exposesAuditStatus && context.operationLedger
      ? (await context.operationLedger.status()).status
      : exposesAuditStatus ? "unavailable" : null;

    return {
      body: {
        apiVersion: 3,
        operationAuditStatus: auditStatus,
        principal: context.principal,
      },
      statusCode: 200,
    };
  }
  if (operation.path === "/api/v3/auth/session") {
    return handleOwnerSession(context);
  }
  if (operation.operationId === "getOpenApi") {
    return { body: createApiOpenApiDocument(), statusCode: 200 };
  }
  if (!context.principal) {
    throw new ApiRequestError("unauthorized", "Owner authentication is required");
  }
  const authorizedContext: ApiHandlerContext = {
    ...context,
    principal: context.principal,
  };
  if (operation.operationId === "streamContentEvents") {
    requireBuiltInCatalog(authorizedContext.builtInCatalog);
    authorizedContext.eventHub.connect({
      checkpoint: createCheckpoint({
        eventHub: authorizedContext.eventHub,
        revisionTracker: authorizedContext.revisionTracker,
      }),
      headers: authorizedContext.responseHeaders,
      principal: authorizedContext.principal,
      response: authorizedContext.response,
    });
    return null;
  }
  if (operation.operationId === "searchContent") {
    const search = authorizedContext.search;

    if (!search) {
      throw new ApiRequestError(
        "adapter_unavailable",
        "Search is unavailable",
      );
    }
    return {
      body: await search.search(
        await authorizedContext.readJsonBody() as ApiSearchRequestDto,
        authorizedContext.principal,
      ),
      statusCode: 200,
    };
  }
  if ([
    "listWorkspaces",
    "getWorkspaceTree",
    "getWorkspaceNote",
  ].includes(operation.operationId)) {
    return handleWorkspaceQuery(authorizedContext);
  }
  if (["listJournalEntries", "getJournalEntry"].includes(
    operation.operationId,
  )) {
    return handleJournalQuery(authorizedContext);
  }
  if (["listTodoCollections", "getTodoCollection"].includes(
    operation.operationId,
  )) {
    return handleTodoQuery(authorizedContext);
  }
  if (operation.path.startsWith("/api/v3/agent/")) {
    return handleAgentOperation(authorizedContext);
  }
  if ([
    "getWorkspaceSyncSnapshot",
    "putWorkspaceSyncSnapshot",
    "getJournalSyncSnapshot",
    "putJournalSyncSnapshot",
    "getTodoSyncSnapshot",
    "putTodoSyncSnapshot",
  ].includes(operation.operationId)) {
    return handleApiSync(authorizedContext, {
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
    return handleRepositoryAdmin(authorizedContext);
  }
  if (operation.operationId === "listBuiltIns") {
    return {
      body: await requireBuiltInCatalog(authorizedContext.builtInCatalog).listBuiltIns(),
      statusCode: 200,
    };
  }
  if (operation.operationId === "retryBuiltIn") {
    return {
      body: await requireBuiltInCatalog(authorizedContext.builtInCatalog).retry(
        route.builtInId,
      ),
      statusCode: 200,
    };
  }
  if (["listApiTokens", "createApiToken", "revokeToken"].includes(
    operation.operationId,
  )) {
    return handleTokenAdmin(authorizedContext);
  }
  if (
    operation.operationId === "listOperations" ||
    operation.operationId === "getOperationAuditStatus"
  ) {
    if (!authorizedContext.operationLedger) {
      if (operation.operationId === "listOperations") {
        throw new ApiRequestError(
          "operation_audit_unavailable",
          "Operation audit is not configured on this server",
        );
      }
      return {
        body: {
          message: "Operation audit is not configured on this server",
          status: "unavailable",
        },
        statusCode: 200,
      };
    }
    if (operation.operationId === "getOperationAuditStatus") {
      return {
        body: await authorizedContext.operationLedger.status(),
        statusCode: 200,
      };
    }
    return {
      body: await authorizedContext.operationLedger.list(parseAuditQuery(authorizedContext.query)),
      statusCode: 200,
    };
  }
  if (
    operation.operationId === "getAgentConfiguration" ||
    operation.operationId.startsWith("createAgentProfile") ||
    operation.operationId.startsWith("updateAgentProfile") ||
    operation.operationId.startsWith("deleteAgentProfile") ||
    operation.operationId.startsWith("createAgentProvider") ||
    operation.operationId.startsWith("updateAgentProvider") ||
    operation.operationId.startsWith("deleteAgentProvider")
    || operation.operationId === "discoverOllamaProvider"
    || operation.operationId === "probeAgentProvider"
    || operation.operationId === "clearAgentProviderAuthentication"
    || operation.operationId.includes("AgentCodexDeviceLogin")
    || operation.operationId.endsWith("AgentProfileConformanceCheck")
  ) {
    return handleAgentConfigurationAdmin(authorizedContext);
  }
  if (operation.operationId.includes("SystemConfiguration") ||
      operation.operationId.includes("OwnerCredential") ||
      operation.operationId.includes("DataRootMigration")) {
    return handleSystemAdministration(authorizedContext);
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
