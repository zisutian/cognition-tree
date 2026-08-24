// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import type {
  ApiPrincipalDto,
  ApiRevisionCheckpointDto,
} from "../../../../contracts/api/types.ts";
import type { DomainChangeSetDto } from "../../../../contracts/common/domainChanges.ts";
import {
  type ApiOperationDefinition,
  type ResolvedApiRoute,
} from "../../../../contracts/api/registry.ts";
import type { WorkspaceRepositoryCatalog } from "../../repository/catalog.ts";
import type { ApiBuiltInCatalog } from "./ports.ts";
import { ApiRequestError } from "./errors.ts";
import { ApiEventHub } from "../sync/events.ts";
import {
  ApiRevisionTracker,
  type ApiTrackedDomain,
} from "../sync/revisionTracker.ts";
import {
  readApiRuntimeNow,
  type ApiRuntime,
} from "./runtime.ts";
import type { ApiSearchService } from "../search.ts";
import type { AutomationTokenStore } from "../../access/automationTokenStore.ts";
import type { AgentOperationLedger } from "../../agent/operationLedger.ts";
import type { AgentService } from "../../agent/service.ts";
import type { AgentConfigurationStore } from "../../agent/configurationStore.ts";
import type { AgentProviderOperations } from "../../agent/providerOperations.ts";

export type HandlerResult = {
  body: unknown;
  statusCode: number;
};


export function requireBuiltInCatalog(
  catalog: ApiBuiltInCatalog | undefined,
): ApiBuiltInCatalog {
  if (!catalog) {
    throw new ApiRequestError(
      "adapter_unavailable",
      "Built-in data catalog is unavailable",
    );
  }
  return catalog;
}

export function assertOperationAccess(
  principal: ApiPrincipalDto,
  operation: ApiOperationDefinition,
) {
  if (operation.access.kind === "public" || principal.kind !== "automation") {
    return;
  }
  if (operation.access.kind === "owner") {
    throw new ApiRequestError(
      "forbidden",
      "This operation is restricted to an owner",
    );
  }
  const required = operation.access.domain === "any"
    ? null
    : `${operation.access.domain}:read` as const;

  if (
    required ? !principal.scopes.includes(required) : principal.scopes.length === 0
  ) {
    throw new ApiRequestError("forbidden", "A matching read scope is required");
  }
}

export function assertRepositoryAllowed(
  principal: ApiPrincipalDto,
  repositoryId: string,
) {
  if (
    principal.kind === "automation" &&
    principal.repositoryIds !== null &&
    !principal.repositoryIds.includes(repositoryId)
  ) {
    throw new ApiRequestError(
      "forbidden",
      "Token is not allowed to access this repository",
    );
  }
}

export function createCheckpoint({
  eventHub,
  revisionTracker,
}: {
  eventHub: ApiEventHub;
  revisionTracker: ApiRevisionTracker;
}): ApiRevisionCheckpointDto {
  return revisionTracker.checkpoint({
    sequence: eventHub.sequence,
    streamId: eventHub.streamId,
  });
}

export type ApiHandlerContext = {
  accessStore: AutomationTokenStore;
  agentConfigurationStore: AgentConfigurationStore;
  agentProviderOperations: AgentProviderOperations;
  agentService: AgentService | null;
  builtInCatalog?: ApiBuiltInCatalog;
  catalog: WorkspaceRepositoryCatalog;
  eventHub: ApiEventHub;
  operation: ApiOperationDefinition;
  operationLedger: AgentOperationLedger | null;
  principal: ApiPrincipalDto;
  query: unknown;
  readJsonBody(): Promise<unknown>;
  requestId: string;
  response: ServerResponse;
  responseHeaders: OutgoingHttpHeaders;
  revisionTracker: ApiRevisionTracker;
  route: ResolvedApiRoute;
  runtime: ApiRuntime;
  search: ApiSearchService | null;
};

export function publishTrackedChanges(
  context: Pick<
    ApiHandlerContext,
    "eventHub" | "revisionTracker"
  >,
  changes: DomainChangeSetDto,
) {
  context.eventHub.publish(
    createCheckpoint(context),
    changes,
  );
}

export function observeWorkspaceRevision(
  context: ApiHandlerContext,
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
    occurredAt: readApiRuntimeNow(context.runtime).timestamp,
    resources: [{
      domain: "workspace",
      kind: "updated",
      repositoryId,
      resourceId: repositoryId,
      version: revision,
    }],
  });
}

export function observeBuiltInRevision(
  context: ApiHandlerContext,
  domain: ApiTrackedDomain,
  revision: `sha256:${string}`,
) {
  if (
    context.revisionTracker.observeDomain(domain, revision) !== "changed"
  ) {
    return;
  }
  publishTrackedChanges(context, {
    blocks: [],
    occurredAt: readApiRuntimeNow(context.runtime).timestamp,
    resources: [{
      domain,
      kind: "updated",
      resourceId: domain,
      version: revision,
    }],
  });
}
