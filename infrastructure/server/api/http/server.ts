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
import type { AgentService } from "../../agent/service.ts";
import type { AgentOperationLedger } from "../../agent/operationLedger.ts";
import { AgentConfigurationStore } from "../../agent/configurationStore.ts";

export type ApiRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

export type ApiServerOptions = {
  accessStore?: AutomationTokenStore;
  agentConfigurationStore?: AgentConfigurationStore;
  agentService?: AgentService | null;
  builtInCatalog?: ApiBuiltInCatalog;
  catalog: WorkspaceRepositoryCatalog;
  eventHub?: ApiEventHub;
  logger?: Pick<Console, "error">;
  operationLedger?: AgentOperationLedger | null;
  runtime?: ApiRuntime;
  revisionTracker?: ApiRevisionTracker;
  security: ApiSecurityPolicy;
  stateDirectory?: string;
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
  agentService = null,
  builtInCatalog,
  catalog,
  eventHub = new ApiEventHub(),
  logger = console,
  operationLedger = null,
  runtime = systemApiRuntime,
  revisionTracker = new ApiRevisionTracker(),
  security,
  stateDirectory = path.join(
    process.cwd(),
    ".cognition-tree",
    "server",
  ),
}: ApiServerOptions): ApiRequestHandler {
  const resolvedAccessStore = accessStore ?? new AutomationTokenStore(
    stateDirectory,
  );
  const resolvedAgentConfigurationStore = agentConfigurationStore ??
    new AgentConfigurationStore(stateDirectory);
  const search = createApiSearchService({
    builtInCatalog,
    catalog,
  });

  return async (request, response) => {
    const requestId = randomUUID();
    let responseHeaders = createApiResponseHeaders(null, requestId);

    try {
      const authorized = await authorizeApiRequest(
        request,
        security,
        resolvedAccessStore,
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
        agentService,
        builtInCatalog,
        catalog,
        eventHub,
        operation,
        operationLedger,
        principal: authorized.principal,
        query,
        readJsonBody: () => {
          parsedBody ??= readApiJsonBody(request).then((input) =>
            parseApiOperationRequest(operation, input)
          );
          return parsedBody;
        },
        requestId,
        response,
        responseHeaders,
        revisionTracker,
        route,
        runtime,
        search,
      });

      if (result) {
        assertApiOperationResponse(
          operation,
          result.statusCode,
          result.body,
        );
        sendApiJson(
          response,
          result.statusCode,
          result.body,
          responseHeaders,
        );
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
      if (mapped.code === "unauthorized") {
        responseHeaders = {
          ...responseHeaders,
          "WWW-Authenticate": "Bearer",
        };
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

export function createApiServer(options: ApiServerOptions) {
  const server = http.createServer(createApiRequestHandler(options));

  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.requestTimeout = 30_000;
  return server;
}
