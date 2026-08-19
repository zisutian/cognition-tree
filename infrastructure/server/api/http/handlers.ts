// SPDX-License-Identifier: GPL-3.0-or-later

import { createApiV1OpenApiDocument } from "../../../../contracts/api/openApi.ts";
import type { ApiV1SearchRequestDto } from "../../../../contracts/api/types.ts";
import type { WorkspaceRepositoryCatalog } from "../../repository/catalog.ts";
import type { ApiV1BuiltInCatalog } from "./ports.ts";
import { ApiV1RequestError } from "./errors.ts";
import {
  assertRouteScopes,
  createCheckpoint,
  requireBuiltInCatalog,
  type ApiV1HandlerContext,
  type HandlerResult,
} from "./handlerContext.ts";
import {
  handleJournalQuery,
  handleTodoQuery,
  handleWorkspaceQuery,
} from "./queryHandlers.ts";
import { handleApiV1Command } from "../commands/handler.ts";
import { handleApiV1Sync } from "../sync/handlers.ts";
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
import { ApiV1SearchService } from "../search.ts";

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
    return handleApiV1Command(context);
  }
  if (
    route.kind === "sync-workspace" ||
    route.kind === "sync-journal" ||
    route.kind === "sync-todo"
  ) {
    return handleApiV1Sync(context, {
      journal: journalResourceVersions,
      todo: todoResourceVersions,
      workspace: workspaceResourceVersions,
    });
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
}: {
  builtInCatalog?: ApiV1BuiltInCatalog;
  catalog: WorkspaceRepositoryCatalog;
}) {
  return builtInCatalog
    ? new ApiV1SearchService({ builtInCatalog, catalog })
    : null;
}
