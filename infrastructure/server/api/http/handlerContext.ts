// SPDX-License-Identifier: GPL-3.0-or-later

import type {
OutgoingHttpHeaders,
ServerResponse,
} from "node:http";
import type {
ApiPrincipalDto,
} from "../../../../contracts/api/index.ts";
import {
type ApiOperationDefinition,
type ResolvedApiRoute,
} from "../../../../contracts/api/index.ts";
import type {
ApiBuiltInCatalog,
WorkspaceRepositoryCatalog,
} from "../../repository/index.ts";

import {
DomainRevisionTracker,
type DomainChangeCoordinator,
} from "../../../../application/sync/index.ts";
import type { ApiSearchService } from "../index.ts";
import { ApiRequestError } from "../protocol/index.ts";
import { ApiEventHub, createApiChangeCoordinator } from "../sync/index.ts";
import {
readApiRuntimeNow,
type ApiRuntime,
} from "./runtime.ts";

import type {
AgentProviderOperations,
AgentService,
} from "../../../../application/agentHost/index.ts";
import type { AgentConfigurationStore } from "../../agent/index.ts";
import type { OperationLedger } from "../../operations/index.ts";

import type { ContentService } from "../../../../application/content/index.ts";
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
  if (!isOwnerPrincipal(principal)) throw new ApiRequestError("forbidden", "Unknown principal is denied");
  if (access.kind === "local-content") {
    if (principal.kind !== "local-owner") throw new ApiRequestError("forbidden", "Content commands require a verified local connection.");
    return;
  }
}

export function isOwnerPrincipal(principal: ApiPrincipalDto | null) {
  return principal?.kind === "local-owner" || principal?.kind === "owner";
}

export type ApiHandlerContext = {
  contentService: ContentService | null;
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
};

export type ApiRouteHandlerContext = Omit<ApiHandlerContext, "principal"> & {
  principal: ApiPrincipalDto | null;
};

export function changeCoordinator(
  context: Pick<ApiHandlerContext, "eventHub" | "revisionTracker" | "runtime">,
): DomainChangeCoordinator {
  return createApiChangeCoordinator({
    eventHub: context.eventHub,
    revisionTracker: context.revisionTracker,
    now: () => readApiRuntimeNow(context.runtime).timestamp,
  });
}
