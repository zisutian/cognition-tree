// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import { serializeJsonIteratively } from "../../../../contracts/common/index.ts";
import { apiAllowedMethods } from "../../../../contracts/api/index.ts";
import {
  JsonRequestBodyError,
  readJsonRequestBody,
  readSingleHttpHeader,
} from "../../network/index.ts";
import { ApiRequestError } from "../protocol/index.ts";

export const defaultMaximumBodyBytes = 20 * 1024 * 1024;

export class ApiRequestAbortedError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("API request body was aborted");
    this.name = "ApiRequestAbortedError";
    this.cause = cause;
  }
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
  const contentLength = readSingleHttpHeader(request, "content-length");
  const transferEncoding = readSingleHttpHeader(request, "transfer-encoding");

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
  try {
    return await readJsonRequestBody(request, maximumBodyBytes);
  } catch (error) {
    if (!(error instanceof JsonRequestBodyError)) throw error;
    if (error.failure === "aborted") {
      throw new ApiRequestAbortedError(error.cause);
    }
    const mapped = {
      empty: ["Request body is empty", 400],
      "invalid-content-length": ["Content-Length is invalid", 400],
      "invalid-json": ["Request body is invalid JSON", 400],
      "invalid-utf8": ["Request body is invalid UTF-8", 400],
      "too-large": ["Request body is too large", 413],
      "unsupported-media-type": [
        "Content-Type must be application/json",
        415,
      ],
    } as const;
    const [message, statusCode] = mapped[error.failure];

    throw new ApiRequestError("invalid_request", message, { statusCode });
  }
}
