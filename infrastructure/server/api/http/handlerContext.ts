// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import type {
  ApiV1DomainChangeSetDto,
  ApiV1PrincipalDto,
  ApiV1RevisionCheckpointDto,
  ApiV1Scope,
} from "../../../../contracts/api/types.ts";
import {
  getApiV1RouteOperation,
  type ResolvedApiV1Route,
} from "../../../../contracts/api/registry.ts";
import type { WorkspaceRepositoryCatalog } from "../../repository/catalog.ts";
import type { ApiV1BuiltInCatalog } from "./ports.ts";
import { ApiV1RequestError } from "./errors.ts";
import { ApiV1EventHub } from "../sync/events.ts";
import {
  ApiV1RevisionTracker,
  type ApiV1TrackedDomain,
} from "../sync/revisionTracker.ts";
import {
  readApiV1RuntimeNow,
  type ApiV1Runtime,
} from "./runtime.ts";
import type { ApiV1SearchService } from "../search.ts";
import type { ApiV1StateStore } from "../state/store.ts";

export type HandlerResult = {
  body: unknown;
  statusCode: number;
};


export function requireBuiltInCatalog(
  catalog: ApiV1BuiltInCatalog | undefined,
): ApiV1BuiltInCatalog {
  if (!catalog) {
    throw new ApiV1RequestError(
      "adapter_unavailable",
      "Built-in data catalog is unavailable",
    );
  }
  return catalog;
}

export function assertScope(principal: ApiV1PrincipalDto, scope: ApiV1Scope) {
  if (!principal.scopes.includes(scope)) {
    throw new ApiV1RequestError(
      "forbidden",
      `Required API scope is missing: ${scope}`,
    );
  }
}

export function assertRouteScopes(
  principal: ApiV1PrincipalDto,
  route: ResolvedApiV1Route,
  method: string,
) {
  const operation = getApiV1RouteOperation(route, method);

  for (const scope of operation.scopes) {
    assertScope(principal, scope);
  }
  if (
    operation.anyScopes.length > 0 &&
    !operation.anyScopes.some((scope) => principal.scopes.includes(scope))
  ) {
    throw new ApiV1RequestError(
      "forbidden",
      `One readable API scope is required: ${operation.anyScopes.join(", ")}`,
    );
  }
}

export function assertRepositoryAllowed(
  principal: ApiV1PrincipalDto,
  repositoryId: string,
) {
  if (
    principal.repositoryIds !== null &&
    !principal.repositoryIds.includes(repositoryId)
  ) {
    throw new ApiV1RequestError(
      "forbidden",
      "Token is not allowed to access this repository",
    );
  }
}

export function createCheckpoint({
  eventHub,
  revisionTracker,
}: {
  eventHub: ApiV1EventHub;
  revisionTracker: ApiV1RevisionTracker;
}): ApiV1RevisionCheckpointDto {
  return revisionTracker.checkpoint({
    sequence: eventHub.sequence,
    streamId: eventHub.streamId,
  });
}

export type ApiV1HandlerContext = {
  builtInCatalog?: ApiV1BuiltInCatalog;
  catalog: WorkspaceRepositoryCatalog;
  eventHub: ApiV1EventHub;
  method: string;
  principal: ApiV1PrincipalDto;
  query: unknown;
  readJsonBody(): Promise<unknown>;
  requestId: string;
  response: ServerResponse;
  responseHeaders: OutgoingHttpHeaders;
  revisionTracker: ApiV1RevisionTracker;
  route: ResolvedApiV1Route;
  runtime: ApiV1Runtime;
  search: ApiV1SearchService | null;
  stateStore: ApiV1StateStore;
};

export function publishTrackedChanges(
  context: Pick<
    ApiV1HandlerContext,
    "eventHub" | "revisionTracker"
  >,
  changes: ApiV1DomainChangeSetDto,
) {
  context.eventHub.publish(
    createCheckpoint(context),
    changes,
  );
}

export function observeWorkspaceRevision(
  context: ApiV1HandlerContext,
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
    occurredAt: readApiV1RuntimeNow(context.runtime).timestamp,
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
  context: ApiV1HandlerContext,
  domain: ApiV1TrackedDomain,
  revision: `sha256:${string}`,
) {
  if (
    context.revisionTracker.observeDomain(domain, revision) !== "changed"
  ) {
    return;
  }
  publishTrackedChanges(context, {
    blocks: [],
    occurredAt: readApiV1RuntimeNow(context.runtime).timestamp,
    resources: [{
      domain,
      kind: "updated",
      resourceId: domain,
      version: revision,
    }],
  });
}
