// SPDX-License-Identifier: GPL-3.0-or-later

import http from "node:http";
import type {
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import { WorkspaceRepositoryContractError } from "../contracts/workspace-repository/contractValue.ts";
import type {
  WorkspaceRepositoryCommitResultDto,
  WorkspaceRepositorySnapshotDto,
} from "../contracts/workspace-repository/types.ts";
import {
  WorkspacePayloadValidationError,
  WorkspaceRevisionConflictError,
} from "./workspaceFileStore.ts";

const allowedMethods = "GET, OPTIONS, PUT";
const maxBodyBytes = 20 * 1024 * 1024;
const routeMethods = new Map<string, readonly string[]>([
  ["/api/health", ["GET"]],
  ["/api/repository-snapshot", ["GET", "PUT"]],
]);

export const defaultWorkspaceApiAllowedOrigins = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
] as const;

export type WorkspaceApiRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

type WorkspaceRepositoryStore = {
  commitSnapshot: (
    value: unknown,
  ) => Promise<WorkspaceRepositoryCommitResultDto>;
  loadSnapshot: () => Promise<WorkspaceRepositorySnapshotDto>;
};

type WorkspaceApiOptions = {
  allowedOrigins?: readonly string[];
  store: WorkspaceRepositoryStore;
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

function normalizeAllowedOrigin(value: string) {
  const origin = new URL(value).origin;

  if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
    throw new Error(`Unsupported API origin: ${value}`);
  }

  return origin;
}

export function parseWorkspaceApiAllowedOrigins(value: string | undefined) {
  const values = value === undefined
    ? defaultWorkspaceApiAllowedOrigins
    : value.split(",").map((item) => item.trim()).filter(Boolean);

  return [...new Set(values.map(normalizeAllowedOrigin))];
}

function getRequestHeader(request: IncomingMessage, name: string) {
  const value = request.headers[name.toLowerCase()];

  return Array.isArray(value) ? value[0] : value;
}

function createCorsHeaders(origin: string | null): OutgoingHttpHeaders {
  return {
    "Access-Control-Allow-Headers": "content-type",
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

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
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
  allowedOrigins = defaultWorkspaceApiAllowedOrigins,
  store,
}: WorkspaceApiOptions): WorkspaceApiRequestHandler {
  const allowedOriginSet = new Set(allowedOrigins.map(normalizeAllowedOrigin));

  return async (request, response) => {
    const requestOrigin = getRequestHeader(request, "origin");
    const allowedOrigin = requestOrigin && allowedOriginSet.has(requestOrigin)
      ? requestOrigin
      : null;
    const responseHeaders = createCorsHeaders(allowedOrigin);

    try {
      if (requestOrigin && !allowedOrigin) {
        throw new WorkspaceApiRequestError(403, "Origin is not allowed");
      }

      const url = new URL(request.url ?? "/", "http://localhost");
      const methods = routeMethods.get(url.pathname);

      if (!methods) {
        throw new WorkspaceApiRequestError(404, "Not found");
      }

      if (request.method === "OPTIONS") {
        sendNoContent(response, responseHeaders);
        return;
      }

      if (!request.method || !methods.includes(request.method)) {
        sendError(response, 405, "Method not allowed", {
          ...responseHeaders,
          Allow: methods.join(", "),
        });
        return;
      }

      if (url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true }, responseHeaders);
        return;
      }

      if (
        url.pathname === "/api/repository-snapshot" &&
        request.method === "GET"
      ) {
        sendJson(response, 200, await store.loadSnapshot(), responseHeaders);
        return;
      }

      if (url.pathname === "/api/repository-snapshot") {
        try {
          const body = await readJsonBody(request);

          sendJson(
            response,
            200,
            await store.commitSnapshot(body),
            responseHeaders,
          );
        } catch (error) {
          throw mapRepositoryCommitError(error);
        }
        return;
      }
    } catch (error) {
      const statusCode = error instanceof WorkspaceApiRequestError
        ? error.statusCode
        : 500;
      const message = error instanceof Error ? error.message : "Unknown error";

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
  allowedOrigins,
  store,
}: WorkspaceApiOptions) {
  return http.createServer(
    createWorkspaceApiRequestHandler({ allowedOrigins, store }),
  );
}
