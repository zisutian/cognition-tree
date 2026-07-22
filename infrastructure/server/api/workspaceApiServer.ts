// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import http from "node:http";
import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";
import type { WorkspaceRepositoryCatalog } from "../repository/repositoryCatalog.ts";
import {
  handleBuiltInApiRoute,
  isBuiltInApiRoute,
  type BuiltInApiCatalog,
} from "./builtInApiHandlers.ts";
import {
  createSafeWorkspaceApiLogError,
  mapWorkspaceApiError,
  WorkspaceApiRequestError,
} from "./workspaceApiErrors.ts";
import {
  resolveWorkspaceApiRoute,
  workspaceApiAllowedMethods,
} from "./workspaceApiRoutes.ts";
import {
  authorizeWorkspaceApiRequest,
  WorkspaceApiSecurityError,
  type WorkspaceApiSecurityPolicy,
} from "./workspaceApiSecurity.ts";
import {
  assertWorkspaceApiRequestHasNoBody,
  createWorkspaceApiResponseHeaders,
  readWorkspaceApiJsonBody,
  sendWorkspaceApiError,
  sendWorkspaceApiJson,
  sendWorkspaceApiNoContent,
} from "./workspaceApiTransport.ts";
import { handleWorkspaceRepositoryApiRoute } from "./workspaceRepositoryApiHandlers.ts";

export type WorkspaceApiRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

type WorkspaceApiOptions = {
  builtInCatalog?: BuiltInApiCatalog;
  catalog: WorkspaceRepositoryCatalog;
  logger?: Pick<Console, "error">;
  security: WorkspaceApiSecurityPolicy;
};

function mapSecurityError(error: WorkspaceApiSecurityError) {
  return new WorkspaceApiRequestError(
    error.statusCode === 401 || error.statusCode === 403
      ? "unauthorized"
      : "invalid_request",
    error.message,
    error.statusCode,
  );
}

export function createWorkspaceApiRequestHandler({
  builtInCatalog,
  catalog,
  logger = console,
  security,
}: WorkspaceApiOptions): WorkspaceApiRequestHandler {
  return async (request, response) => {
    const requestId = randomUUID();
    const sensitiveLogValues: string[] = [];
    let responseHeaders = createWorkspaceApiResponseHeaders(null, requestId);

    try {
      const { allowedOrigin } = authorizeWorkspaceApiRequest(request, security);

      responseHeaders = createWorkspaceApiResponseHeaders(
        allowedOrigin,
        requestId,
      );
      const url = new URL(request.url ?? "/", "http://localhost");
      const route = resolveWorkspaceApiRoute(url.pathname);

      if (!route) {
        throw new WorkspaceApiRequestError(
          "invalid_request",
          "Not found",
          404,
        );
      }
      if (request.method === "OPTIONS") {
        sendWorkspaceApiNoContent(response, responseHeaders);
        return;
      }
      const method = request.method;

      if (!method || !route.methods.includes(method)) {
        throw new WorkspaceApiRequestError(
          "invalid_request",
          "Method not allowed",
          405,
        );
      }
      if (method === "GET" || method === "DELETE") {
        assertWorkspaceApiRequestHasNoBody(request);
      }
      if (route.kind === "built-in-retry") {
        assertWorkspaceApiRequestHasNoBody(request);
      }
      if (route.kind !== "repository" && url.search !== "") {
        throw new WorkspaceApiRequestError(
          "invalid_request",
          "Query parameters are not allowed for this route",
        );
      }
      const readJsonBody = () => readWorkspaceApiJsonBody(request);
      const result = isBuiltInApiRoute(route)
        ? await handleBuiltInApiRoute({
            builtInCatalog,
            method,
            readJsonBody,
            route,
          })
        : await handleWorkspaceRepositoryApiRoute({
            catalog,
            method,
            readJsonBody,
            route,
            sensitiveLogValues,
            url,
          });

      sendWorkspaceApiJson(
        response,
        result.statusCode,
        result.body,
        responseHeaders,
      );
    } catch (error) {
      if (error instanceof WorkspaceApiSecurityError && error.allowedOrigin) {
        responseHeaders = createWorkspaceApiResponseHeaders(
          error.allowedOrigin,
          requestId,
        );
      }
      const mapped = error instanceof WorkspaceApiSecurityError
        ? mapSecurityError(error)
        : mapWorkspaceApiError(error);

      if (mapped.statusCode >= 500) {
        logger.error(
          `[${requestId}] workspace API request failed`,
          createSafeWorkspaceApiLogError(error, sensitiveLogValues),
        );
      }
      if (mapped.code === "unauthorized" && mapped.statusCode === 401) {
        responseHeaders = {
          ...responseHeaders,
          "WWW-Authenticate": "Bearer",
        };
      }
      if (mapped.statusCode === 405) {
        responseHeaders = {
          ...responseHeaders,
          Allow: workspaceApiAllowedMethods,
        };
      }
      sendWorkspaceApiError(response, mapped, requestId, responseHeaders);
    }
  };
}

export function createWorkspaceApiServer(options: WorkspaceApiOptions) {
  const server = http.createServer(createWorkspaceApiRequestHandler(options));

  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.requestTimeout = 30_000;
  return server;
}
