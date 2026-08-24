// SPDX-License-Identifier: GPL-3.0-or-later

import {
  apiAutomationScopes,
  type AutomationApiScope,
  type ApiCreateTokenRequestDto,
} from "../../../../contracts/api/types.ts";
import { parseRepositoryDeletionMode } from "../../../../contracts/workspace/parseCatalog.ts";
import type {
  CreateRepositoryDto,
  RenameRepositoryDto,
} from "../../../../contracts/workspace/types.ts";
import type {
  AgentConfigurationDeleteRequestDto,
  AgentProfileMutationRequestDto,
  AgentProviderMutationRequestDto,
} from "../../../../contracts/agent/configurationSchemas.ts";
import { ApiRequestError, apiNotFound } from "./errors.ts";
import {
  publishTrackedChanges,
  type ApiHandlerContext,
} from "./handlerContext.ts";
import { readApiRuntimeNow } from "./runtime.ts";

const automationTokenScopes = new Set<AutomationApiScope>(apiAutomationScopes);

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
  const { accessStore, operation, route } = context;

  if (operation.operationId === "listApiTokens") {
    return { body: { tokens: await accessStore.listTokens() }, statusCode: 200 };
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
        "Automation tokens may only use domain read scopes",
      );
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
      body: await accessStore.createToken(request),
      statusCode: 201,
    };
  }
  const tokenId = route.tokenId ?? "";
  const removed = await accessStore.revokeToken(tokenId);

  if (!removed) apiNotFound("API token does not exist");
  context.eventHub.revokePrincipal(tokenId);
  return { body: { revoked: true }, statusCode: 200 };
}

export async function handleAgentConfigurationAdmin(
  context: ApiHandlerContext,
) {
  const { agentConfigurationStore: store, agentService, operation, route } =
    context;

  if (operation.operationId === "getAgentConfiguration") {
    return { body: await store.readSnapshot(), statusCode: 200 };
  }
  if (operation.operationId === "createAgentProvider") {
    const request = await context.readJsonBody() as
      AgentProviderMutationRequestDto;
    const result = await store.createProvider(
      request.baseRevision,
      request.provider,
    );

    return { body: result.configuration, statusCode: 201 };
  }
  if (operation.operationId === "createAgentProfile") {
    const request = await context.readJsonBody() as
      AgentProfileMutationRequestDto;
    const result = await store.createProfile(
      request.baseRevision,
      request.profile,
    );

    return { body: result.configuration, statusCode: 201 };
  }
  if (operation.operationId === "updateAgentProvider") {
    const providerId = route.providerId ?? "";

    if (agentService?.hasResidentProviderSession(providerId)) {
      throw new ApiRequestError(
        "resource_conflict",
        "Agent provider is pinned by a resident session",
      );
    }
    const request = await context.readJsonBody() as
      AgentProviderMutationRequestDto;
    const result = await store.updateProvider(
      request.baseRevision,
      providerId,
      request.provider,
    );

    return { body: result.configuration, statusCode: 200 };
  }
  if (operation.operationId === "updateAgentProfile") {
    const request = await context.readJsonBody() as
      AgentProfileMutationRequestDto;
    const result = await store.updateProfile(
      request.baseRevision,
      route.profileId ?? "",
      request.profile,
    );

    return { body: result.configuration, statusCode: 200 };
  }
  const request = await context.readJsonBody() as
    AgentConfigurationDeleteRequestDto;

  if (operation.operationId === "deleteAgentProvider") {
    const providerId = route.providerId ?? "";

    if (agentService?.hasResidentProviderSession(providerId)) {
      throw new ApiRequestError(
        "resource_conflict",
        "Agent provider is pinned by a resident session",
      );
    }
    return {
      body: await store.deleteProvider(request.baseRevision, providerId),
      statusCode: 200,
    };
  }
  const profileId = route.profileId ?? "";

  if (agentService?.hasResidentProfileSession(profileId)) {
    throw new ApiRequestError(
      "resource_conflict",
      "Agent profile is pinned by a resident session",
    );
  }
  return {
    body: await store.deleteProfile(request.baseRevision, profileId),
    statusCode: 200,
  };
}

export function parseAuditQuery(query: unknown) {
  const source = query as { cursor?: number; limit?: number };

  return {
    cursor: source.cursor ?? 0,
    limit: source.limit ?? 50,
  };
}
