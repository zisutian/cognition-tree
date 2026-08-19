// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import type {
  ApiDomainChangeSetDto,
  ApiPrincipalDto,
  ApiRevisionCheckpointDto,
  ApiScope,
} from "../../../../contracts/api/types.ts";
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
import type { ApiStateStore } from "../state/store.ts";

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

export function assertScope(principal: ApiPrincipalDto, scope: ApiScope) {
  if (!principal.scopes.includes(scope)) {
    throw new ApiRequestError(
      "forbidden",
      `Required API scope is missing: ${scope}`,
    );
  }
}

export function assertOperationScopes(
  principal: ApiPrincipalDto,
  operation: ApiOperationDefinition,
) {
  for (const scope of operation.scopes) {
    assertScope(principal, scope);
  }
  if (
    operation.anyScopes.length > 0 &&
    !operation.anyScopes.some((scope) => principal.scopes.includes(scope))
  ) {
    throw new ApiRequestError(
      "forbidden",
      `One readable API scope is required: ${operation.anyScopes.join(", ")}`,
    );
  }
}

export function assertRepositoryAllowed(
  principal: ApiPrincipalDto,
  repositoryId: string,
) {
  if (
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
  builtInCatalog?: ApiBuiltInCatalog;
  catalog: WorkspaceRepositoryCatalog;
  eventHub: ApiEventHub;
  operation: ApiOperationDefinition;
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
  stateStore: ApiStateStore;
};

export function publishTrackedChanges(
  context: Pick<
    ApiHandlerContext,
    "eventHub" | "revisionTracker"
  >,
  changes: ApiDomainChangeSetDto,
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
