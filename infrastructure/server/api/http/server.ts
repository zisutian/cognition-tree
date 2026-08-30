// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import http from "node:http";
import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";
import path from "node:path";
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
  createApiSearchService,
  handleApiRoute,
} from "./handlers.ts";
import {
  authorizeApiRequest,
  ApiSecurityError,
  type ApiSecurityPolicy,
} from "./security.ts";
import {
  assertApiRequestHasNoBody,
  createApiResponseHeaders,
  readApiJsonBody,
  sendApiJson,
  sendApiNoContent,
} from "./transport.ts";
import { createSafeApiLogError } from "./log.ts";
import {
  ApiEventHub,
} from "../sync/events.ts";
import {
  systemApiRuntime,
  type ApiRuntime,
} from "./runtime.ts";
import {
  ApiRevisionTracker,
} from "../sync/revisionTracker.ts";
import { AutomationTokenStore } from "../../access/automationTokenStore.ts";
import { TrustedClientTokenStore } from "../../access/trustedClientTokenStore.ts";
import type { AgentService } from "../../agent/service.ts";
import type { OperationLedger } from "../../operations/operationLedger.ts";
import { AgentConfigurationStore } from "../../agent/configurationStore.ts";
import { AgentProviderOperations } from "../../agent/providerOperations.ts";
import type { SystemAdministrationServerPort } from "../../../../application/system/systemConfiguration.ts";
import { ApiMaintenanceGate } from "./maintenanceGate.ts";

export type ApiRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

export type ApiServerOptions = {
  accessStore?: AutomationTokenStore;
  agentConfigurationStore?: AgentConfigurationStore;
  agentProviderOperations?: AgentProviderOperations;
  agentService?: AgentService | null;
  builtInCatalog?: ApiBuiltInCatalog;
  catalog: WorkspaceRepositoryCatalog;
  eventHub?: ApiEventHub;
  logger?: Pick<Console, "error">;
  maintenanceGate?: ApiMaintenanceGate;
  operationLedger?: OperationLedger | null;
  requestRestart?: () => void;
  runtime?: ApiRuntime;
  revisionTracker?: ApiRevisionTracker;
  security: ApiSecurityPolicy;
  stateDirectory?: string;
  systemAdministration?: SystemAdministrationServerPort | null;
  trustedClientTokenStore?: TrustedClientTokenStore;
};

function mapSecurityError(error: ApiSecurityError) {
  return new ApiRequestError(
    error.statusCode === 401 ? "unauthorized" : "forbidden",
    error.message,
    { statusCode: error.statusCode },
  );
}

export function createApiRequestHandler({
  accessStore,
  agentConfigurationStore,
  agentProviderOperations,
  agentService = null,
  builtInCatalog,
  catalog,
  eventHub = new ApiEventHub(),
  logger = console,
  maintenanceGate = new ApiMaintenanceGate(),
  operationLedger = null,
  requestRestart = () => undefined,
  runtime = systemApiRuntime,
  revisionTracker = new ApiRevisionTracker(),
  security,
  stateDirectory = path.join(
    process.cwd(),
    ".cognition-tree",
    "server",
  ),
  systemAdministration = null,
  trustedClientTokenStore,
}: ApiServerOptions): ApiRequestHandler {
  const resolvedAccessStore = accessStore ?? new AutomationTokenStore(
    stateDirectory,
  );
  const resolvedTrustedClientTokenStore = trustedClientTokenStore ??
    new TrustedClientTokenStore(stateDirectory);
  const bearerAuthenticator = {
    authenticate: async (secret: string) =>
      await resolvedAccessStore.authenticate(secret) ??
      await resolvedTrustedClientTokenStore.authenticate(secret),
  };
  const resolvedAgentConfigurationStore = agentConfigurationStore ??
    new AgentConfigurationStore(stateDirectory);
  const resolvedAgentProviderOperations = agentProviderOperations ??
    new AgentProviderOperations({
      configurationStore: resolvedAgentConfigurationStore,
      runtime,
    });
  const search = createApiSearchService({
    builtInCatalog,
    catalog,
  });

  return async (request, response) => {
    const requestId = randomUUID();
    let responseHeaders = createApiResponseHeaders(null, requestId);
    let leaveRequest: (() => void) | null = null;

    try {
      leaveRequest = maintenanceGate.enter(request.method);
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
      if (response.headersSent) {
        response.destroy();
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
        logger.error(
          `[${requestId}] CTN API v3 request failed`,
          createSafeApiLogError(error),
        );
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

export function createApiServer(
  options: ApiServerOptions,
  fallbackRequestHandler?: ApiRequestHandler,
) {
  const apiRequestHandler = createApiRequestHandler(options);
  const server = http.createServer((request, response) => {
    let pathname: string;

    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      void apiRequestHandler(request, response);
      return;
    }
    const handler = pathname === "/api" || pathname.startsWith("/api/") ||
        !fallbackRequestHandler
      ? apiRequestHandler
      : fallbackRequestHandler;

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
