// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import type { RepositoryApiErrorDto } from "../../../contracts/workspace/types.ts";
import { WorkspaceApiRequestError } from "./workspaceApiErrors.ts";
import { workspaceApiAllowedMethods } from "./workspaceApiRoutes.ts";

const maxBodyBytes = 20 * 1024 * 1024;

function getRequestHeader(request: IncomingMessage, name: string) {
  const value = request.headers[name.toLowerCase()];

  return Array.isArray(value) ? value[0] : value;
}

export function createWorkspaceApiResponseHeaders(
  origin: string | null,
  requestId: string,
): OutgoingHttpHeaders {
  return {
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": workspaceApiAllowedMethods,
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Request-Id": requestId,
  };
}

export function sendWorkspaceApiJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: OutgoingHttpHeaders,
) {
  response.writeHead(statusCode, {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(serializeJsonIteratively(body));
}

export function sendWorkspaceApiNoContent(
  response: ServerResponse,
  headers: OutgoingHttpHeaders,
) {
  response.writeHead(204, headers);
  response.end();
}

export function sendWorkspaceApiError(
  response: ServerResponse,
  error: WorkspaceApiRequestError,
  requestId: string,
  headers: OutgoingHttpHeaders,
) {
  const body: RepositoryApiErrorDto = {
    code: error.code,
    ...(error.currentRevision
      ? { currentRevision: error.currentRevision }
      : {}),
    message: error.message,
    requestId,
  };

  sendWorkspaceApiJson(response, error.statusCode, body, headers);
}

export function assertWorkspaceApiRequestHasNoBody(
  request: IncomingMessage,
) {
  const contentLength = getRequestHeader(request, "content-length");
  const transferEncoding = getRequestHeader(request, "transfer-encoding");

  if ((contentLength && contentLength !== "0") || transferEncoding) {
    throw new WorkspaceApiRequestError(
      "invalid_request",
      "Request body is not allowed for this method",
    );
  }
}

export async function readWorkspaceApiJsonBody(
  request: IncomingMessage,
): Promise<unknown> {
  const contentType = getRequestHeader(request, "content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();

  if (contentType !== "application/json") {
    throw new WorkspaceApiRequestError(
      "invalid_request",
      "Content-Type must be application/json",
      415,
    );
  }
  const contentLength = getRequestHeader(request, "content-length");

  if (contentLength && !/^\d+$/.test(contentLength)) {
    throw new WorkspaceApiRequestError(
      "invalid_request",
      "Content-Length is invalid",
    );
  }
  if (contentLength && Number(contentLength) > maxBodyBytes) {
    throw new WorkspaceApiRequestError(
      "invalid_request",
      "Request body is too large",
      413,
    );
  }
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new WorkspaceApiRequestError(
        "invalid_request",
        "Request body is too large",
        413,
      );
    }
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString("utf8").trim();

  if (!body) {
    throw new WorkspaceApiRequestError(
      "invalid_request",
      "Request body is empty",
    );
  }
  try {
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new WorkspaceApiRequestError(
        "invalid_request",
        "Request body is invalid JSON",
      );
    }
    throw error;
  }
}
