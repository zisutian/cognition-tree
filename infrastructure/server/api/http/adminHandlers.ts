// SPDX-License-Identifier: GPL-3.0-or-later

import {
  apiAutomationScopes,
  type ApiCreateTokenRequestDto,
  type ApiScope,
} from "../../../../contracts/api/types.ts";
import { parseRepositoryDeletionMode } from "../../../../contracts/workspace/parseCatalog.ts";
import type {
  CreateRepositoryDto,
  RenameRepositoryDto,
} from "../../../../contracts/workspace/types.ts";
import { ApiRequestError, apiNotFound } from "./errors.ts";
import {
  publishTrackedChanges,
  type ApiHandlerContext,
} from "./handlerContext.ts";
import { readApiRuntimeNow } from "./runtime.ts";

const automationTokenScopes = new Set<ApiScope>(apiAutomationScopes);

export async function handleRepositoryAdmin(context: ApiHandlerContext) {
  const { catalog, operation, route } = context;

  if (operation.operationId === "listAdminRepositories") {
    return { body: await catalog.listRepositories(), statusCode: 200 };
  }
  if (operation.operationId === "createAdminRepository") {
    const descriptor = await catalog.createRepository(
      await context.readJsonBody() as CreateRepositoryDto,
    );
    const revision = await catalog.getStore(descriptor.id)
      .then((store) => store.loadSnapshot())
      .then((snapshot) => snapshot.revision);

    context.revisionTracker.observeWorkspace(descriptor.id, revision);
    await publishTrackedChanges(context, {
      blocks: [],
      occurredAt: readApiRuntimeNow(context.runtime).timestamp,
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

  if (operation.operationId === "renameAdminRepository") {
    const descriptor = await catalog.renameRepository(
      repositoryId,
      await context.readJsonBody() as RenameRepositoryDto,
    );
    const revision = await catalog.getStore(repositoryId)
      .then((store) => store.loadSnapshot())
      .then((snapshot) => snapshot.revision);

    context.revisionTracker.observeWorkspace(repositoryId, revision);
    await publishTrackedChanges(context, {
      blocks: [],
      occurredAt: readApiRuntimeNow(context.runtime).timestamp,
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
  await publishTrackedChanges(context, {
    blocks: [],
    occurredAt: readApiRuntimeNow(context.runtime).timestamp,
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
export async function handleTokenAdmin(context: ApiHandlerContext) {
  const { operation, route, stateStore } = context;

  if (operation.operationId === "listApiTokens") {
    return { body: { tokens: await stateStore.listTokens() }, statusCode: 200 };
  }
  if (operation.operationId === "createApiToken") {
    const request =
      await context.readJsonBody() as ApiCreateTokenRequestDto;

    if (
      request.scopes.length === 0 ||
      request.scopes.some((scope) => !automationTokenScopes.has(scope))
    ) {
      throw new ApiRequestError(
        "domain_validation_failed",
        "Automation tokens may only use domain read, write, and delete scopes",
      );
    }
    for (const domain of ["workspace", "journal", "todo"] as const) {
      if (
        request.scopes.includes(`${domain}:delete`) &&
        !request.scopes.includes(`${domain}:write`)
      ) {
        throw new ApiRequestError(
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
          throw new ApiRequestError(
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

  if (!removed) apiNotFound("API token does not exist");
  context.eventHub.revokePrincipal(tokenId);
  return { body: { revoked: true }, statusCode: 200 };
}

export function parseAuditQuery(query: unknown) {
  const source = query as { cursor?: number; limit?: number };

  return {
    cursor: source.cursor ?? 0,
    limit: source.limit ?? 50,
  };
}
