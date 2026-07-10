// SPDX-License-Identifier: GPL-3.0-or-later

import http from "node:http";
import {
  WorkspaceFileStore,
  WorkspacePayloadValidationError,
} from "./workspaceFileStore.mjs";
import { WorkspaceDtoValidationError } from "./workspaceManifestDto.mjs";

const allowedMethods = "GET, OPTIONS, PUT";
const maxBodyBytes = 20 * 1024 * 1024;
const routeMethods = new Map([
  ["/api/health", ["GET"]],
  ["/api/repository", ["GET"]],
  ["/api/syntax", ["GET", "PUT"]],
  ["/api/workspace", ["GET", "PUT"]],
]);

export const defaultWorkspaceApiAllowedOrigins = Object.freeze([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

class WorkspaceApiRequestError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "WorkspaceApiRequestError";
    this.statusCode = statusCode;
  }
}

function normalizeAllowedOrigin(value) {
  const origin = new URL(value).origin;

  if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
    throw new Error(`Unsupported API origin: ${value}`);
  }

  return origin;
}

export function parseWorkspaceApiAllowedOrigins(value) {
  const values = value === undefined
    ? defaultWorkspaceApiAllowedOrigins
    : value.split(",").map((item) => item.trim()).filter(Boolean);

  return [...new Set(values.map(normalizeAllowedOrigin))];
}

function getRequestHeader(request, name) {
  const value = request.headers?.[name.toLowerCase()];

  return Array.isArray(value) ? value[0] : value;
}

function createCorsHeaders(origin) {
  return {
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": allowedMethods,
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    Vary: "Origin",
  };
}

function sendJson(response, statusCode, body, headers) {
  response.writeHead(statusCode, {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function sendNoContent(response, headers) {
  response.writeHead(204, headers);
  response.end();
}

function sendError(response, statusCode, message, headers) {
  sendJson(response, statusCode, { error: message }, headers);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > maxBodyBytes) {
      throw new WorkspaceApiRequestError(413, "Request body is too large");
    }

    chunks.push(chunk);
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

function mapWorkspaceSaveError(error) {
  if (
    error instanceof WorkspaceDtoValidationError ||
    error instanceof WorkspacePayloadValidationError
  ) {
    return new WorkspaceApiRequestError(400, error.message);
  }

  return error;
}

export function createWorkspaceApiRequestHandler({
  allowedOrigins = defaultWorkspaceApiAllowedOrigins,
  store,
}) {
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

      if (url.pathname === "/api/repository") {
        sendJson(response, 200, { path: store.repositoryPath }, responseHeaders);
        return;
      }

      if (url.pathname === "/api/workspace" && request.method === "GET") {
        sendJson(response, 200, await store.loadWorkspace(), responseHeaders);
        return;
      }

      if (url.pathname === "/api/workspace") {
        try {
          await store.saveWorkspace(await readJsonBody(request));
        } catch (error) {
          throw mapWorkspaceSaveError(error);
        }

        sendNoContent(response, responseHeaders);
        return;
      }

      if (url.pathname === "/api/syntax" && request.method === "GET") {
        const workspaceSyntaxSourceFile =
          await store.readWorkspaceSyntaxSourceFile();

        sendJson(
          response,
          200,
          workspaceSyntaxSourceFile
            ? {
                fileName: workspaceSyntaxSourceFile.fileName,
                source: workspaceSyntaxSourceFile.source,
              }
            : null,
          responseHeaders,
        );
        return;
      }

      const body = await readJsonBody(request);

      if (typeof body.source !== "string" || body.source.trim().length === 0) {
        throw new WorkspaceApiRequestError(
          400,
          "Syntax profile source is required",
        );
      }

      await store.saveWorkspaceSyntaxSource(body.source);
      sendNoContent(response, responseHeaders);
    } catch (error) {
      const statusCode = error instanceof WorkspaceApiRequestError
        ? error.statusCode
        : 500;
      const message = error instanceof Error ? error.message : "Unknown error";

      sendError(response, statusCode, message, responseHeaders);
    }
  };
}

export function createWorkspaceApiServer({ allowedOrigins, store }) {
  return http.createServer(
    createWorkspaceApiRequestHandler({ allowedOrigins, store }),
  );
}

export { WorkspaceFileStore };
