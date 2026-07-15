// SPDX-License-Identifier: GPL-3.0-or-later

import http from "node:http";
import type {
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import {
  WorkspaceRepositoryContractError,
} from "../contracts/workspace-repository/contractValue.ts";
import { parseCreateRepository } from "../contracts/workspace-repository/parseCatalog.ts";
import {
  RepositoryAdapterError,
  RepositoryCatalogError,
  WorkspaceRevisionConflictError,
  type WorkspaceRepositoryCatalog,
} from "./repositoryAdapter.ts";
import { WorkspacePayloadValidationError } from "./workspaceRepositoryLayout.ts";
import {
  authorizeWorkspaceApiRequest,
  WorkspaceApiSecurityError,
  type WorkspaceApiSecurityPolicy,
} from "./workspaceApiSecurity.ts";

const allowedMethods = "GET, OPTIONS, POST, PUT";
const maxBodyBytes = 20 * 1024 * 1024;

type WorkspaceApiRoute =
  | { kind: "health"; methods: readonly string[] }
  | { kind: "repositories"; methods: readonly string[] }
  | {
      kind: "repository-snapshot";
      methods: readonly string[];
      repositoryId: string;
    };

export type WorkspaceApiRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

type WorkspaceApiOptions = {
  catalog: WorkspaceRepositoryCatalog;
  security: WorkspaceApiSecurityPolicy;
};

class WorkspaceApiRequestError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "WorkspaceApiRequestError";
    this.statusCode = statusCode;
  }
}

class WorkspaceApiConflictError extends WorkspaceApiRequestError {
  currentRevision: string;

  constructor(currentRevision: string) {
    super(409, "Repository content changed outside the current session");
    this.name = "WorkspaceApiConflictError";
    this.currentRevision = currentRevision;
  }
}

function resolveRoute(pathname: string): WorkspaceApiRoute | null {
  if (pathname === "/api/health") {
    return { kind: "health", methods: ["GET"] };
  }

  if (pathname === "/api/repositories") {
    return { kind: "repositories", methods: ["GET", "POST"] };
  }

  const match = /^\/api\/repositories\/([^/]+)\/snapshot$/.exec(pathname);

  if (!match) {
    return null;
  }

  let repositoryId: string;

  try {
    repositoryId = decodeURIComponent(match[1]);
  } catch {
    throw new WorkspaceApiRequestError(400, "Invalid repository id encoding");
  }

  return {
    kind: "repository-snapshot",
    methods: ["GET", "PUT"],
    repositoryId,
  };
}

function getRequestHeader(request: IncomingMessage, name: string) {
  const value = request.headers[name.toLowerCase()];

  return Array.isArray(value) ? value[0] : value;
}

function createCorsHeaders(origin: string | null): OutgoingHttpHeaders {
  return {
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": allowedMethods,
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    Vary: "Origin",
  };
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: OutgoingHttpHeaders,
) {
  response.writeHead(statusCode, {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function sendNoContent(
  response: ServerResponse,
  headers: OutgoingHttpHeaders,
) {
  response.writeHead(204, headers);
  response.end();
}

function sendError(
  response: ServerResponse,
  statusCode: number,
  message: string,
  headers: OutgoingHttpHeaders,
) {
  sendJson(response, statusCode, { error: message }, headers);
}

function assertRequestHasNoBody(request: IncomingMessage) {
  const contentLength = getRequestHeader(request, "content-length");
  const transferEncoding = getRequestHeader(request, "transfer-encoding");

  if ((contentLength && contentLength !== "0") || transferEncoding) {
    throw new WorkspaceApiRequestError(
      400,
      "Request body is not allowed for this method",
    );
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = getRequestHeader(request, "content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    throw new WorkspaceApiRequestError(
      415,
      "Content-Type must be application/json",
    );
  }

  const contentLength = getRequestHeader(request, "content-length");

  if (contentLength && !/^\d+$/.test(contentLength)) {
    throw new WorkspaceApiRequestError(400, "Content-Length is invalid");
  }
  if (contentLength && Number(contentLength) > maxBodyBytes) {
    throw new WorkspaceApiRequestError(413, "Request body is too large");
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    size += buffer.length;

    if (size > maxBodyBytes) {
      throw new WorkspaceApiRequestError(413, "Request body is too large");
    }

    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();

  if (!body) {
    throw new WorkspaceApiRequestError(400, "Request body is empty");
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new WorkspaceApiRequestError(400, "Request body is invalid JSON");
    }

    throw error;
  }
}

function mapRepositoryCommitError(error: unknown): unknown {
  if (error instanceof RepositoryAdapterError) {
    return new WorkspaceApiRequestError(error.statusCode, error.message);
  }

  if (error instanceof RepositoryCatalogError) {
    return new WorkspaceApiRequestError(error.statusCode, error.message);
  }

  if (error instanceof WorkspaceRevisionConflictError) {
    return new WorkspaceApiConflictError(error.currentRevision);
  }

  if (
    error instanceof WorkspaceRepositoryContractError ||
    error instanceof WorkspacePayloadValidationError
  ) {
    return new WorkspaceApiRequestError(400, error.message);
  }

  return error;
}

export function createWorkspaceApiRequestHandler({
  catalog,
  security,
}: WorkspaceApiOptions): WorkspaceApiRequestHandler {
  return async (request, response) => {
    let responseHeaders = createCorsHeaders(null);

    try {
      const { allowedOrigin } = authorizeWorkspaceApiRequest(request, security);

      responseHeaders = createCorsHeaders(allowedOrigin);

      const url = new URL(request.url ?? "/", "http://localhost");
      const route = resolveRoute(url.pathname);

      if (!route) {
        throw new WorkspaceApiRequestError(404, "Not found");
      }

      if (request.method === "OPTIONS") {
        sendNoContent(response, responseHeaders);
        return;
      }

      if (!request.method || !route.methods.includes(request.method)) {
        sendError(response, 405, "Method not allowed", {
          ...responseHeaders,
          Allow: route.methods.join(", "),
        });
        return;
      }

      if (request.method === "GET") {
        assertRequestHasNoBody(request);
      }

      if (route.kind === "health") {
        sendJson(response, 200, { ok: true }, responseHeaders);
        return;
      }

      if (route.kind === "repositories") {
        try {
          if (request.method === "GET") {
            sendJson(
              response,
              200,
              await catalog.listRepositories(),
              responseHeaders,
            );
            return;
          }

          const body = parseCreateRepository(await readJsonBody(request));

          sendJson(
            response,
            201,
            await catalog.createRepository(body),
            responseHeaders,
          );
        } catch (error) {
          throw mapRepositoryCommitError(error);
        }
        return;
      }

      try {
        const store = await catalog.getStore(route.repositoryId);

        if (request.method === "GET") {
          sendJson(response, 200, await store.loadSnapshot(), responseHeaders);
        } else {
          const body = await readJsonBody(request);

          sendJson(
            response,
            200,
            await store.commitSnapshot(body),
            responseHeaders,
          );
        }
      } catch (error) {
        throw mapRepositoryCommitError(error);
      }
      return;
    } catch (error) {
      if (
        error instanceof WorkspaceApiSecurityError &&
        error.allowedOrigin
      ) {
        responseHeaders = createCorsHeaders(error.allowedOrigin);
      }

      const statusCode = error instanceof WorkspaceApiRequestError ||
          error instanceof WorkspaceApiSecurityError
        ? error.statusCode
        : 500;
      const message = error instanceof Error ? error.message : "Unknown error";

      if (
        error instanceof WorkspaceApiSecurityError &&
        statusCode === 401
      ) {
        responseHeaders = {
          ...responseHeaders,
          "WWW-Authenticate": "Bearer",
        };
      }

      if (error instanceof WorkspaceApiConflictError) {
        sendJson(
          response,
          statusCode,
          {
            currentRevision: error.currentRevision,
            error: message,
          },
          responseHeaders,
        );
      } else {
        sendError(response, statusCode, message, responseHeaders);
      }
    }
  };
}

export function createWorkspaceApiServer({
  catalog,
  security,
}: WorkspaceApiOptions) {
  const server = http.createServer(
    createWorkspaceApiRequestHandler({ catalog, security }),
  );

  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.requestTimeout = 30_000;
  return server;
}
