// SPDX-License-Identifier: GPL-3.0-or-later

import { parseApiError } from "../../contracts/api/parseError.ts";
import type { ApiErrorDto } from "../../contracts/api/types.ts";

const loopbackHosts = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

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
    let response: Response;

    try {
      response = await this.#fetch(url, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.#secret}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        method,
        redirect: "error",
      });
    } catch (error) {
      throw new Error(
        `API network request failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
    if (response.status === 204) return null;
    let value: unknown;

    try {
      value = await response.json();
    } catch {
      throw new Error(`API returned a non-JSON response (${response.status})`);
    }
    if (!response.ok) {
      throw new CliApiError(response.status, parseApiError(value));
    }
    return value;
  }
}
