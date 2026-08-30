// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import { TextDecoder } from "node:util";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import { apiAllowedMethods } from "../../../../contracts/api/registry.ts";
import { ApiRequestError } from "./errors.ts";

export const defaultMaximumBodyBytes = 20 * 1024 * 1024;

function getRequestHeader(request: IncomingMessage, name: string) {
  const value = request.headers[name.toLowerCase()];

  return Array.isArray(value) ? value[0] : value;
}

export function createApiResponseHeaders(
  origin: string | null,
  requestId: string,
): OutgoingHttpHeaders {
  return {
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": apiAllowedMethods,
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Request-Id": requestId,
  };
}

export function sendApiJson(
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

export function sendApiNoContent(
  response: ServerResponse,
  headers: OutgoingHttpHeaders,
) {
  response.writeHead(204, headers);
  response.end();
}

export function assertApiRequestHasNoBody(request: IncomingMessage) {
  const contentLength = getRequestHeader(request, "content-length");
  const transferEncoding = getRequestHeader(request, "transfer-encoding");

  if ((contentLength && contentLength !== "0") || transferEncoding) {
    throw new ApiRequestError(
      "invalid_request",
      "Request body is not allowed for this method",
    );
  }
}

export async function readApiJsonBody(
  request: IncomingMessage,
  maximumBodyBytes = defaultMaximumBodyBytes,
): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBodyBytes) || maximumBodyBytes < 1) {
    throw new Error("API operation body limit must be a positive integer");
  }
  const contentType = getRequestHeader(request, "content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();

  if (contentType !== "application/json") {
    throw new ApiRequestError(
      "invalid_request",
      "Content-Type must be application/json",
      { statusCode: 415 },
    );
  }
  const contentLength = getRequestHeader(request, "content-length");

  if (contentLength && !/^\d+$/.test(contentLength)) {
    throw new ApiRequestError(
      "invalid_request",
      "Content-Length is invalid",
    );
  }
  if (contentLength && Number(contentLength) > maximumBodyBytes) {
    throw new ApiRequestError(
      "invalid_request",
      "Request body is too large",
      { statusCode: 413 },
    );
  }
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    size += buffer.length;
    if (size > maximumBodyBytes) {
      throw new ApiRequestError(
        "invalid_request",
        "Request body is too large",
        { statusCode: 413 },
      );
    }
    chunks.push(buffer);
  }
  let source: string;

  try {
    source = new TextDecoder("utf-8", { fatal: true })
      .decode(Buffer.concat(chunks)).trim();
  } catch {
    throw new ApiRequestError(
      "invalid_request",
      "Request body is invalid UTF-8",
    );
  }

  if (!source) {
    throw new ApiRequestError(
      "invalid_request",
      "Request body is empty",
    );
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new ApiRequestError(
      "invalid_request",
      "Request body is invalid JSON",
    );
  }
}
