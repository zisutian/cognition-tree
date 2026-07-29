// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import http from "node:http";
import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";
import path from "node:path";
import {
  apiV1AllowedMethods,
  assertApiV1OperationResponse,
  getApiV1RouteOperation,
  parseApiV1OperationRequest,
  parseApiV1OperationQuery,
  resolveApiV1Route,
} from "../../../contracts/api/registry.ts";
import type {
  WorkspaceRepositoryCatalog,
} from "../repository/repositoryCatalog.ts";
import type {
  ApiV1BuiltInCatalog,
} from "./apiV1Ports.ts";
import {
  ApiV1RequestError,
  mapApiV1Error,
} from "./apiV1Errors.ts";
import {
  createApiV1SearchService,
  handleApiV1Route,
} from "./apiV1Handlers.ts";
import {
  authorizeApiV1Request,
  ApiV1SecurityError,
  type ApiV1SecurityPolicy,
} from "./apiV1Security.ts";
import {
  assertApiV1RequestHasNoBody,
  createApiV1ResponseHeaders,
  readApiV1JsonBody,
  sendApiV1Json,
  sendApiV1NoContent,
} from "./apiV1Transport.ts";
import { createSafeApiV1LogError } from "./apiV1Log.ts";
import {
  ApiV1EventHub,
} from "./apiV1Events.ts";
import {
  systemApiV1Runtime,
  type ApiV1Runtime,
} from "./apiV1Runtime.ts";
import {
  ApiV1StateStore,
} from "../repository/apiV1StateStore.ts";

export type ApiV1RequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

type ApiV1ServerOptions = {
  builtInCatalog?: ApiV1BuiltInCatalog;
  catalog: WorkspaceRepositoryCatalog;
  eventHub?: ApiV1EventHub;
  logger?: Pick<Console, "error">;
  runtime?: ApiV1Runtime;
  security: ApiV1SecurityPolicy;
  stateDirectory?: string;
  stateStore?: ApiV1StateStore;
};

function mapSecurityError(error: ApiV1SecurityError) {
  return new ApiV1RequestError(
    error.statusCode === 401 ? "unauthorized" : "forbidden",
    error.message,
    { statusCode: error.statusCode },
  );
}

export function createApiV1RequestHandler({
  builtInCatalog,
  catalog,
  eventHub = new ApiV1EventHub(),
  logger = console,
  runtime = systemApiV1Runtime,
  security,
  stateDirectory = path.join(
    process.cwd(),
    ".cognition-tree",
    "server",
  ),
  stateStore = new ApiV1StateStore(stateDirectory),
}: ApiV1ServerOptions): ApiV1RequestHandler {
  const search = createApiV1SearchService({
    builtInCatalog,
    catalog,
    runtime,
  });

  return async (request, response) => {
    const requestId = randomUUID();
    let responseHeaders = createApiV1ResponseHeaders(null, requestId);

    try {
      const authorized = await authorizeApiV1Request(
        request,
        security,
        stateStore,
      );

      responseHeaders = createApiV1ResponseHeaders(
        authorized.allowedOrigin,
        requestId,
      );
      const url = new URL(request.url ?? "/", "http://localhost");
      const route = resolveApiV1Route(url.pathname);

      if (!route) {
        throw new ApiV1RequestError("not_found", "Not found");
      }
      if (request.method === "OPTIONS") {
        sendApiV1NoContent(response, responseHeaders);
        return;
      }
      const method = request.method;

      if (
        !method ||
        !route.methods.includes(
          method as (typeof route.methods)[number],
        )
      ) {
        throw new ApiV1RequestError(
          "invalid_request",
          "Method not allowed",
          { statusCode: 405 },
        );
      }
      const operation = getApiV1RouteOperation(route, method);

      if (!operation.body) {
        assertApiV1RequestHasNoBody(request);
      }
      const query = parseApiV1OperationQuery(
        route,
        method,
        url.searchParams,
      );
      let parsedBody: Promise<unknown> | null = null;
      const result = await handleApiV1Route({
        builtInCatalog,
        catalog,
        eventHub,
        method,
        principal: authorized.principal,
        query,
        readJsonBody: () => {
          parsedBody ??= readApiV1JsonBody(request).then((input) =>
            parseApiV1OperationRequest(route, method, input)
          );
          return parsedBody;
        },
        requestId,
        response,
        responseHeaders,
        route,
        runtime,
        search,
        stateStore,
      });

      if (result) {
        assertApiV1OperationResponse(
          route,
          method,
          result.statusCode,
          result.body,
        );
        sendApiV1Json(
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
      if (error instanceof ApiV1SecurityError && error.allowedOrigin) {
        responseHeaders = createApiV1ResponseHeaders(
          error.allowedOrigin,
          requestId,
        );
      }
      const mapped = error instanceof ApiV1SecurityError
        ? mapSecurityError(error)
        : mapApiV1Error(error);

      if (mapped.statusCode >= 500) {
        logger.error(
          `[${requestId}] CTN API v1 request failed`,
          createSafeApiV1LogError(error),
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
          Allow: apiV1AllowedMethods,
        };
      }
      sendApiV1Json(
        response,
        mapped.statusCode,
        mapped.toDto(requestId),
        responseHeaders,
      );
    }
  };
}

export function createApiV1Server(options: ApiV1ServerOptions) {
  const server = http.createServer(createApiV1RequestHandler(options));

  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.requestTimeout = 30_000;
  return server;
}
