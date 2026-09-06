// SPDX-License-Identifier: GPL-3.0-or-later

import type { ApiSearchService } from "../search.ts";
import { randomUUID } from "node:crypto";
import http from "node:http";
import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";
import {
  apiAllowedMethods,
  assertApiOperationResponse,
  getApiRouteOperation,
  parseApiOperationRequest,
  parseApiOperationQuery,
  resolveApiRoute,
} from "../../../../contracts/api/registry.ts";
import type {
  WorkspaceRepositoryCatalog,
} from "../../repository/catalog.ts";
import type {
  ApiBuiltInCatalog,
} from "./ports.ts";
import {
  ApiRequestError,
  mapApiError,
} from "./errors.ts";
import {
  handleApiRoute,
} from "./handlers.ts";
import {
  authorizeApiRequest,
  ApiSecurityError,
  type ApiSecurityPolicy,
} from "./security.ts";
import {
  ApiRequestAbortedError,
  assertApiRequestHasNoBody,
  createApiResponseHeaders,
  readApiJsonBody,
  sendApiJson,
  sendApiNoContent,
} from "./transport.ts";
import { reportApiRequestFailure } from "./log.ts";
import {
  ApiEventHub,
} from "../sync/events.ts";
import {
  type ApiRuntime,
} from "./runtime.ts";
import {
  ApiRevisionTracker,
} from "../sync/revisionTracker.ts";
import { AutomationTokenStore } from "../../access/automationTokenStore.ts";
import { TrustedClientTokenStore } from "../../access/trustedClientTokenStore.ts";
import type { AgentService } from "../../../../application/agentHost/service.ts";
import type { OperationLedger } from "../../operations/operationLedger.ts";
import { AgentConfigurationStore } from "../../agent/configurationStore.ts";
import { AgentProviderOperations } from "../../agent/providerOperations.ts";
import type { SystemAdministrationServerPort } from "../../../../application/system/systemConfiguration.ts";
import { ApiMaintenanceGate } from "./maintenanceGate.ts";

export type ApiRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

export type ApiHttpDependencies = {
  accessStore: AutomationTokenStore;
  agentConfigurationStore: AgentConfigurationStore;
  agentProviderOperations: AgentProviderOperations;
  agentService: AgentService | null;
  builtInCatalog: ApiBuiltInCatalog | undefined;
  catalog: WorkspaceRepositoryCatalog;
  search: ApiSearchService | null;
  eventHub: ApiEventHub;
  logger: Pick<Console, "error">;
  maintenanceGate: ApiMaintenanceGate;
  operationLedger: OperationLedger | null;
  requestRestart: () => void;
  runtime: ApiRuntime;
  revisionTracker: ApiRevisionTracker;
  security: ApiSecurityPolicy;
  systemAdministration: SystemAdministrationServerPort | null;
  trustedClientTokenStore: TrustedClientTokenStore;
};

function mapSecurityError(error: ApiSecurityError) {
  return new ApiRequestError(
    error.statusCode === 401 ? "unauthorized" : "forbidden",
    error.message,
    { statusCode: error.statusCode },
  );
}

export function createHttpApiRequestHandler({
  accessStore: resolvedAccessStore,
  trustedClientTokenStore: resolvedTrustedClientTokenStore,
  agentConfigurationStore: resolvedAgentConfigurationStore,
  agentProviderOperations: resolvedAgentProviderOperations,
  agentService, builtInCatalog, catalog, eventHub, logger, maintenanceGate,
  operationLedger, requestRestart, runtime, revisionTracker, search, security,
  systemAdministration,
}: ApiHttpDependencies): ApiRequestHandler {
  const bearerAuthenticator = {
    authenticate: async (secret: string) => maintenanceGate.isClosed() ? null : await resolvedAccessStore.authenticate(secret) ?? await resolvedTrustedClientTokenStore.authenticate(secret),
  };
  return async (request, response) => {
    const requestId = randomUUID();
    let responseHeaders = createApiResponseHeaders(null, requestId);
    let leaveRequest: (() => void) | null = null;

    try {
      const requestedRoute = resolveApiRoute(new URL(request.url ?? "/", "http://localhost").pathname);
      leaveRequest = maintenanceGate.enter(requestedRoute?.operations.get(request.method ?? "")?.operationId);
      const authorized = await authorizeApiRequest(
        request,
        security,
        bearerAuthenticator,
      );

      responseHeaders = createApiResponseHeaders(
        authorized.allowedOrigin,
        requestId,
      );
      const url = new URL(request.url ?? "/", "http://localhost");
      const route = resolveApiRoute(url.pathname);

      if (!route) {
        throw new ApiRequestError("not_found", "Not found");
      }
      if (request.method === "OPTIONS") {
        sendApiNoContent(response, responseHeaders);
        return;
      }
      const method = request.method;

      if (
        !method ||
        !route.methods.includes(
          method as (typeof route.methods)[number],
        )
      ) {
        throw new ApiRequestError(
          "invalid_request",
          "Method not allowed",
          { statusCode: 405 },
        );
      }
      const operation = getApiRouteOperation(route, method);

      if (!operation.body) {
        assertApiRequestHasNoBody(request);
      }
      const query = parseApiOperationQuery(
        operation,
        url.searchParams,
      );
      let parsedBody: Promise<unknown> | null = null;
      const result = await handleApiRoute({
        accessStore: resolvedAccessStore,
        agentConfigurationStore: resolvedAgentConfigurationStore,
        agentProviderOperations: resolvedAgentProviderOperations,
        agentService,
        builtInCatalog,
        catalog,
        eventHub,
        operation,
        operationLedger,
        ownerSessions: security.ownerSessions,
        principal: authorized.principal,
        query,
        readJsonBody: () => {
          parsedBody ??= readApiJsonBody(
            request,
            operation.maximumBodyBytes,
          ).then((input) =>
            parseApiOperationRequest(operation, input)
          );
          return parsedBody;
        },
        requestRestart,
        requestId,
        response,
        responseHeaders,
        revisionTracker,
        route,
        runtime,
        search,
        systemAdministration,
        trustedClientTokenStore: resolvedTrustedClientTokenStore,
      });

      if (result) {
        assertApiOperationResponse(
          operation,
          result.statusCode,
          result.body,
        );
        if (result.statusCode === 204) {
          sendApiNoContent(response, responseHeaders);
        } else {
          sendApiJson(
            response,
            result.statusCode,
            result.body,
            responseHeaders,
          );
        }
      }
    } catch (error) {
      if (error instanceof ApiRequestAbortedError) {
        if (!response.destroyed) response.destroy();
        return;
      }
      if (error instanceof ApiSecurityError && error.allowedOrigin) {
        responseHeaders = createApiResponseHeaders(
          error.allowedOrigin,
          requestId,
        );
      }
      const mapped = error instanceof ApiSecurityError
        ? mapSecurityError(error)
        : mapApiError(error);

      if (mapped.statusCode >= 500) {
        reportApiRequestFailure(logger, requestId, error);
      }
      if (
        response.headersSent ||
        response.destroyed ||
        response.writableEnded
      ) {
        if (!response.destroyed) response.destroy();
        return;
      }
      if (mapped.statusCode === 405) {
        responseHeaders = {
          ...responseHeaders,
          Allow: apiAllowedMethods,
        };
      }
      sendApiJson(
        response,
        mapped.statusCode,
        mapped.toDto(requestId),
        responseHeaders,
      );
    } finally {
      leaveRequest?.();
    }
  };
}

export function createHttpApiServer(
  options: ApiHttpDependencies,
  fallbackRequestHandler?: ApiRequestHandler,
) {
  const apiRequestHandler = createHttpApiRequestHandler(options);
  const server = http.createServer((request, response) => {
    let handler = apiRequestHandler;

    try {
      const pathname = new URL(
        request.url ?? "/",
        "http://localhost",
      ).pathname;

      if (
        fallbackRequestHandler &&
        pathname !== "/api" &&
        !pathname.startsWith("/api/")
      ) {
        handler = fallbackRequestHandler;
      }
    } catch {
      // Invalid request targets belong to the API error envelope.
    }

    void handler(request, response).catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      response.writeHead(500, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("Internal server error");
    });
  });

  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.requestTimeout = 30_000;
  return server;
}
