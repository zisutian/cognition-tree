// SPDX-License-Identifier: GPL-3.0-or-later

import {
  apiAutomationScopes,
  type AutomationApiScope,
  type ApiCreateTokenRequestDto,
  type ApiCreateTrustedClientTokenRequestDto,
} from "../../../../contracts/api/types.ts";
import type {
  CreateRepositoryDto,
  RenameRepositoryDto,
} from "../../../../contracts/workspace/types.ts";
import type {
  AgentConfigurationDeleteRequestDto,
  AgentCodexDeviceLoginRequestDto,
  AgentConformanceCheckRequestDto,
  AgentOllamaDiscoveryRequestDto,
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
  await catalog.deleteRepository(repositoryId);

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
    body: undefined,
    statusCode: 204,
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

export async function handleTrustedClientTokenAdmin(context: ApiHandlerContext) {
  const { eventHub, operation, route, trustedClientTokenStore } = context;

  if (operation.operationId === "listTrustedClientTokens") {
    return {
      body: { tokens: await trustedClientTokenStore.listTokens() },
      statusCode: 200,
    };
  }
  if (operation.operationId === "createTrustedClientToken") {
    return {
      body: await trustedClientTokenStore.createToken(
        await context.readJsonBody() as ApiCreateTrustedClientTokenRequestDto,
      ),
      statusCode: 201,
    };
  }
  const tokenId = route.trustedClientTokenId ?? "";
  const removed = await trustedClientTokenStore.revokeToken(tokenId);

  if (!removed) apiNotFound("Trusted client token does not exist");
  eventHub.revokePrincipal(tokenId);
  return { body: { revoked: true }, statusCode: 200 };
}

export async function handleAgentConfigurationAdmin(
  context: ApiHandlerContext,
) {
  const { agentConfigurationStore: store, operation, route } = context;

  if (operation.operationId === "getAgentConfiguration") {
    return { body: await store.readSnapshot(), statusCode: 200 };
  }
  if (operation.operationId === "discoverOllamaProvider") {
    const request = await context.readJsonBody() as AgentOllamaDiscoveryRequestDto;

    return {
      body: await context.agentProviderOperations.discoverOllama(request.endpoint),
      statusCode: 200,
    };
  }
  if (operation.operationId === "probeAgentProvider") {
    return {
      body: await context.agentProviderOperations.probe(route.providerId ?? ""),
      statusCode: 200,
    };
  }
  if (operation.operationId === "startAgentCodexDeviceLogin") {
    const providerId = route.providerId ?? "";
    const request = await context.readJsonBody() as
      AgentCodexDeviceLoginRequestDto;

    return {
      body: await context.agentProviderOperations.startCodexDeviceLogin(
        request.baseRevision,
        providerId,
      ),
      statusCode: 202,
    };
  }
  if (operation.operationId === "getAgentCodexDeviceLogin") {
    return {
      body: context.agentProviderOperations.getCodexDeviceLogin(
        route.codexLoginId ?? "",
      ) ?? apiNotFound("Codex device login does not exist"),
      statusCode: 200,
    };
  }
  if (operation.operationId === "cancelAgentCodexDeviceLogin") {
    return {
      body: await context.agentProviderOperations.cancelCodexDeviceLogin(
        route.codexLoginId ?? "",
      ) ?? apiNotFound("Codex device login does not exist"),
      statusCode: 200,
    };
  }
  if (operation.operationId === "clearAgentProviderAuthentication") {
    const providerId = route.providerId ?? "";
    const request = await context.readJsonBody() as
      AgentConfigurationDeleteRequestDto;

    return {
      body: await store.clearProviderAuthentication(
        request.baseRevision,
        providerId,
      ),
      statusCode: 200,
    };
  }
  if (operation.operationId === "startAgentProfileConformanceCheck") {
    const request = await context.readJsonBody() as
      AgentConformanceCheckRequestDto;

    return {
      body: await context.agentProviderOperations.startConformance(
        request.baseRevision,
        route.profileId ?? "",
      ),
      statusCode: 202,
    };
  }
  if (operation.operationId === "getAgentProfileConformanceCheck") {
    return {
      body: context.agentProviderOperations.getConformance(
        route.conformanceCheckId ?? "",
      ) ?? apiNotFound("Agent conformance check does not exist"),
      statusCode: 200,
    };
  }
  if (operation.operationId === "cancelAgentProfileConformanceCheck") {
    return {
      body: context.agentProviderOperations.cancelConformance(
        route.conformanceCheckId ?? "",
      ) ?? apiNotFound("Agent conformance check does not exist"),
      statusCode: 200,
    };
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
    return {
      body: await store.deleteProvider(request.baseRevision, providerId),
      statusCode: 200,
    };
  }
  const profileId = route.profileId ?? "";
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
