// SPDX-License-Identifier: GPL-3.0-or-later

import type { IncomingMessage } from "node:http";
import { TextDecoder } from "node:util";

export type JsonRequestBodyFailure =
  | "aborted"
  | "empty"
  | "invalid-content-length"
  | "invalid-json"
  | "invalid-utf8"
  | "too-large"
  | "unsupported-media-type";

export class JsonRequestBodyError extends Error {
  readonly cause: unknown;
  readonly failure: JsonRequestBodyFailure;

  constructor(failure: JsonRequestBodyFailure, cause?: unknown) {
    super(`JSON request body failed: ${failure}`);
    this.name = "JsonRequestBodyError";
    this.cause = cause;
    this.failure = failure;
  }
}

export function readSingleHttpHeader(
  request: IncomingMessage,
  name: string,
) {
  const value = request.headers[name.toLowerCase()];

  return Array.isArray(value) ? value[0] : value;
}

export async function readJsonRequestBody(
  request: IncomingMessage,
  maximumBytes: number,
): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error("JSON request body limit must be a positive integer");
  }
  const contentType = readSingleHttpHeader(request, "content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();

  if (contentType !== "application/json") {
    throw new JsonRequestBodyError("unsupported-media-type");
  }
  const contentLength = readSingleHttpHeader(request, "content-length");

  if (contentLength && !/^\d+$/.test(contentLength)) {
    throw new JsonRequestBodyError("invalid-content-length");
  }
  if (contentLength && Number(contentLength) > maximumBytes) {
    throw new JsonRequestBodyError("too-large");
  }
  const chunks: Buffer[] = [];
  let size = 0;

  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      size += buffer.length;
      if (size > maximumBytes) {
        throw new JsonRequestBodyError("too-large");
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (!request.aborted) throw error;
    throw new JsonRequestBodyError("aborted", error);
  }
  let source: string;

  try {
    source = new TextDecoder("utf-8", { fatal: true })
      .decode(Buffer.concat(chunks, size)).trim();
  } catch {
    throw new JsonRequestBodyError("invalid-utf8");
  }
  if (!source) throw new JsonRequestBodyError("empty");
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new JsonRequestBodyError("invalid-json");
  }
}
