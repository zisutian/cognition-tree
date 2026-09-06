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
import type { TrustedClientTokenStore } from "../../access/trustedClientTokenStore.ts";
import type { OperationLedger } from "../../operations/operationLedger.ts";
import type { AgentService } from "../../agent/service.ts";
import type { AgentConfigurationStore } from "../../agent/configurationStore.ts";
import type { AgentProviderOperations } from "../../agent/providerOperations.ts";
import type { SystemAdministrationServerPort } from "../../../../application/system/systemConfiguration.ts";
import type { ApiOwnerSessionAuthority } from "./security.ts";

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
  principal: ApiPrincipalDto | null,
  operation: ApiOperationDefinition,
) {
  const { access } = operation;

  if (access.kind === "local-recovery") throw new ApiRequestError("forbidden", "Recovery operations require the local startup recovery server");
  if (access.kind === "public") return;
  if (!principal) {
    throw new ApiRequestError("unauthorized", "Authentication is required");
  }
  switch (principal.kind) {
    case "local-owner":
    case "owner":
      return;
    case "automation": {
      if (access.kind === "owner" || access.kind === "content-sync") {
        throw new ApiRequestError(
          "forbidden",
          "This operation is not available to automation tokens",
        );
      }
      if (access.kind !== "content-read") return rejectUnknownAccess(access);
      const required = access.domain === "any"
        ? null
        : `${access.domain}:read` as const;

      if (
        required
          ? !principal.scopes.includes(required)
          : principal.scopes.length === 0
      ) {
        throw new ApiRequestError("forbidden", "A matching read scope is required");
      }
      return;
    }
    case "trusted-client":
      if (access.kind === "content-read" || access.kind === "content-sync") {
        return;
      }
      if (access.kind === "owner") {
        throw new ApiRequestError(
          "forbidden",
          "Trusted clients cannot access owner operations",
        );
      }
      return rejectUnknownAccess(access);
    default:
      return rejectUnknownPrincipal(principal);
  }
}

function rejectUnknownAccess(value: never): never {
  void value;
  throw new ApiRequestError("forbidden", "Unknown access policy is denied");
}

function rejectUnknownPrincipal(value: never): never {
  void value;
  throw new ApiRequestError("forbidden", "Unknown principal is denied");
}

export function isOwnerPrincipal(principal: ApiPrincipalDto | null) {
  if (!principal) return false;
  switch (principal.kind) {
    case "local-owner":
    case "owner":
      return true;
    case "automation":
    case "trusted-client":
      return false;
    default:
      return rejectUnknownPrincipal(principal);
  }
}

export function assertRepositoryAllowed(
  principal: ApiPrincipalDto,
  repositoryId: string,
) {
  switch (principal.kind) {
    case "local-owner":
    case "owner":
    case "trusted-client":
      return;
    case "automation":
      if (
        principal.repositoryIds !== null &&
        !principal.repositoryIds.includes(repositoryId)
      ) {
        throw new ApiRequestError(
          "forbidden",
          "Token is not allowed to access this repository",
        );
      }
      return;
    default:
      return rejectUnknownPrincipal(principal);
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
  operationLedger: OperationLedger | null;
  ownerSessions: ApiOwnerSessionAuthority;
  principal: ApiPrincipalDto;
  query: unknown;
  readJsonBody(): Promise<unknown>;
  requestRestart(): void;
  requestId: string;
  response: ServerResponse;
  responseHeaders: OutgoingHttpHeaders;
  revisionTracker: ApiRevisionTracker;
  route: ResolvedApiRoute;
  runtime: ApiRuntime;
  search: ApiSearchService | null;
  systemAdministration: SystemAdministrationServerPort | null;
  trustedClientTokenStore: TrustedClientTokenStore;
};

export type ApiRouteHandlerContext = Omit<ApiHandlerContext, "principal"> & {
  principal: ApiPrincipalDto | null;
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
