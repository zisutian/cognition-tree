// SPDX-License-Identifier: GPL-3.0-or-later

import { parseApiError } from "../../contracts/api/parseError.ts";
import type { ApiErrorDto } from "../../contracts/api/types.ts";

const loopbackHosts = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
export const cliHttpRequestTimeoutMilliseconds = 30_000;
export const cliMaximumJsonResponseBytes = 64 * 1024 * 1024;

async function rejectResponse(response: Response, message: string): Promise<never> {
  await response.body?.cancel().catch(() => undefined);
  throw new Error(message);
}

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();

  if (contentType !== "application/json") {
    return rejectResponse(
      response,
      `API returned a non-JSON response (${response.status})`,
    );
  }
  const contentLength = response.headers.get("content-length");

  if (contentLength !== null && !/^\d+$/.test(contentLength)) {
    return rejectResponse(
      response,
      `API returned an invalid Content-Length (${response.status})`,
    );
  }
  if (
    contentLength !== null &&
    Number(contentLength) > cliMaximumJsonResponseBytes
  ) {
    return rejectResponse(
      response,
      `API response body exceeds the size limit (${response.status})`,
    );
  }
  if (!response.body) {
    throw new Error(`API returned no JSON body (${response.status})`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let reachedEnd = false;
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        reachedEnd = true;
        break;
      }
      size += value.byteLength;
      if (size > cliMaximumJsonResponseBytes) {
        throw new Error(
          `API response body exceeds the size limit (${response.status})`,
        );
      }
      chunks.push(value);
    }
  } finally {
    if (!reachedEnd) {
      try {
        await reader.cancel();
      } catch {
        // The original response failure remains authoritative.
      }
    }
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let source: string;

  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`API returned invalid UTF-8 (${response.status})`);
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error(`API returned invalid JSON (${response.status})`);
  }
}

async function assertNoContent(response: Response) {
  if (!response.body) return;
  const reader = response.body.getReader();
  let reachedEnd = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        reachedEnd = true;
        break;
      }
      if (value.byteLength > 0) {
        throw new Error("API returned content where 204 No Content was required");
      }
    }
  } finally {
    if (!reachedEnd) {
      try {
        await reader.cancel();
      } catch {
        // The original response result remains authoritative.
      }
    }
    reader.releaseLock();
  }
}

export function normalizeCliOrigin(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Server origin is not a valid URL");
  }
  if (
    url.username || url.password || url.pathname !== "/" || url.search ||
    url.hash
  ) {
    throw new Error("Server origin cannot contain credentials, a path, query, or fragment");
  }
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && loopbackHosts.has(url.hostname.toLowerCase()))
  ) {
    throw new Error("Server origin must use HTTPS, except for strict loopback HTTP");
  }
  return url.origin;
}

export class CliApiError extends Error {
  readonly error: ApiErrorDto;
  readonly status: number;

  constructor(status: number, error: ApiErrorDto) {
    super(error.message);
    this.name = "CliApiError";
    this.error = error;
    this.status = status;
  }
}

export type CliApiClient = {
  request(method: string, requestPath: string, body?: unknown): Promise<unknown>;
};

export class CliHttpClient implements CliApiClient {
  readonly #fetch: typeof fetch;
  readonly #origin: string;
  readonly #secret: string;

  constructor({
    fetch: fetchFn = globalThis.fetch.bind(globalThis),
    origin,
    secret,
  }: {
    fetch?: typeof fetch;
    origin: string;
    secret: string;
  }) {
    this.#fetch = fetchFn;
    this.#origin = normalizeCliOrigin(origin);
    this.#secret = secret;
  }

  async request(
    method: string,
    requestPath: string,
    body?: unknown,
  ): Promise<unknown> {
    if (!requestPath.startsWith("/api/v3/") || requestPath.includes("#")) {
      throw new Error("CLI request path must start with /api/v3/");
    }
    const url = new URL(requestPath, this.#origin);

    if (
      url.origin !== this.#origin ||
      !url.pathname.startsWith("/api/v3/")
    ) {
      throw new Error("CLI request path cannot escape /api/v3 on the configured origin");
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("CLI API request timed out")),
      cliHttpRequestTimeoutMilliseconds,
    );

    timeout.unref();
    try {
      const response = await this.#fetch(url, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.#secret}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        method,
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 204) {
        await assertNoContent(response);
        return null;
      }
      const value = await readJsonResponse(response);

      if (!response.ok) {
        throw new CliApiError(response.status, parseApiError(value));
      }
      return value;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          controller.signal.reason instanceof Error
            ? controller.signal.reason.message
            : "CLI API request timed out",
        );
      }
      if (error instanceof CliApiError) throw error;
      if (!(error instanceof TypeError)) throw error;
      throw new Error(
        `API network request failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
