// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import type {
IncomingMessage,
ServerResponse,
} from "node:http";
import http from "node:http";
import type { AgentService } from "../../../../application/agentHost/index.ts";
import { AgentProviderOperations } from "../../../../application/agentHost/index.ts";
import type { ContentService } from "../../../../application/content/index.ts";
import {
DomainRevisionTracker,
} from "../../../../application/sync/index.ts";
import type { SystemAdministrationServerPort } from "../../../../application/system/index.ts";
import {
apiAllowedMethods,
assertApiOperationResponse,
getApiRouteOperation,
parseApiOperationQuery,
parseApiOperationRequest,
resolveApiRoute,
} from "../../../../contracts/api/index.ts";
import { AgentConfigurationStore } from "../../agent/index.ts";
import type { OperationLedger } from "../../operations/index.ts";
import type {
ApiBuiltInCatalog,
WorkspaceRepositoryCatalog,
} from "../../repository/index.ts";
import type { ApiSearchService } from "../index.ts";
import { ApiRequestError } from "../protocol/index.ts";
import {
ApiEventHub,
} from "../sync/index.ts";
import { mapApiError } from "./errors.ts";
import {
handleApiRoute,
} from "./handlers.ts";
import { reportApiRequestFailure } from "./log.ts";
import { ApiMaintenanceGate } from "./maintenanceGate.ts";
import {
type ApiRuntime,
} from "./runtime.ts";
import {
ApiSecurityError,
authorizeApiRequest,
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

export type ApiRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

export type ApiHttpDependencies = {
  contentService: ContentService | null;
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
  revisionTracker: DomainRevisionTracker;
  security: ApiSecurityPolicy;
  systemAdministration: SystemAdministrationServerPort | null;
};

function mapSecurityError(error: ApiSecurityError) {
  return new ApiRequestError(
    error.statusCode === 401 ? "unauthorized" : "forbidden",
    error.message,
    { statusCode: error.statusCode },
  );
}

export function createHttpApiRequestHandler({
  agentConfigurationStore: resolvedAgentConfigurationStore,
  agentProviderOperations: resolvedAgentProviderOperations,
  agentService, builtInCatalog, catalog, eventHub, logger, maintenanceGate,
  operationLedger, requestRestart, runtime, revisionTracker, search, security,
  systemAdministration, contentService,
}: ApiHttpDependencies): ApiRequestHandler {
  return async (request, response) => {
    const requestId = randomUUID();
    let responseHeaders = createApiResponseHeaders(null, requestId);

    try {
      const requestedRoute = resolveApiRoute(new URL(request.url ?? "/", "http://localhost").pathname);
      await maintenanceGate.run(requestedRoute?.operations.get(request.method ?? "")?.operationId, async () => {
        const authorized = await authorizeApiRequest(
          request,
          security,
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
          contentService,
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
      });
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
