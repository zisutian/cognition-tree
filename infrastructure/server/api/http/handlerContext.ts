// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import type {
  ApiPrincipalDto,
  ApiRevisionCheckpointDto,
} from "../../../../contracts/api/index.ts";
import type { DomainChangeSetDto } from "../../../../contracts/common/index.ts";
import {
  type ApiOperationDefinition,
  type ResolvedApiRoute,
} from "../../../../contracts/api/index.ts";
import type {
  WorkspaceRepositoryCatalog,
  ApiBuiltInCatalog,
} from "../../repository/index.ts";

import { ApiRequestError } from "../protocol/index.ts";
import { ApiEventHub } from "../sync/index.ts";
import {
  DomainRevisionTracker,
  type TrackedContentDomain,
} from "../../../../application/sync/index.ts";
import {
  readApiRuntimeNow,
  type ApiRuntime,
} from "./runtime.ts";
import type { ApiSearchService } from "../index.ts";
import type {
  AutomationTokenStore,
  TrustedClientTokenStore,
} from "../../access/index.ts";

import type { OperationLedger } from "../../operations/index.ts";
import type {
  AgentService,
  AgentProviderOperations,
} from "../../../../application/agentHost/index.ts";
import type { AgentConfigurationStore } from "../../agent/index.ts";

import type { SystemAdministrationServerPort } from "../../../../application/system/index.ts";
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
  revisionTracker: DomainRevisionTracker;
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
  revisionTracker: DomainRevisionTracker;
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
  domain: TrackedContentDomain,
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
