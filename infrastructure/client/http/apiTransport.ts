// SPDX-License-Identifier: GPL-3.0-or-later

import { parseApiV1Error } from "../../../contracts/api/parseError";
import type { ApiV1ErrorCodeDto } from "../../../contracts/api/types";

export const apiRequestTimeoutMs = 30_000;

export type HttpApiTransportOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
  token?: string;
};

export class HttpApiResponseError extends Error {
  apiCode: ApiV1ErrorCodeDto | null;
  details: Record<string, unknown> | null;
  retryable: boolean;
  statusCode: number;

  constructor(
    message: string,
    {
      apiCode = null,
      details = null,
      retryable = false,
      statusCode,
    }: {
      apiCode?: ApiV1ErrorCodeDto | null;
      details?: Record<string, unknown> | null;
      retryable?: boolean;
      statusCode: number;
    },
  ) {
    super(message);
    this.name = "HttpApiResponseError";
    this.apiCode = apiCode;
    this.details = details;
    this.retryable = retryable;
    this.statusCode = statusCode;
  }
}

export class HttpApiUnavailableError extends Error {
  constructor(message = "API is unavailable") {
    super(message);
    this.name = "HttpApiUnavailableError";
  }
}

export function subscribeClientReconnect(listener: () => void) {
  if (typeof globalThis.addEventListener !== "function") {
    return () => undefined;
  }

  globalThis.addEventListener("online", listener);
  return () => globalThis.removeEventListener("online", listener);
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export function resolveApiUrl(baseUrl: string, endpoint: string) {
  return new URL(
    endpoint.replace(/^\//, ""),
    normalizeBaseUrl(baseUrl),
  ).toString();
}

async function readResponseJson(response: Response, retryable = false) {
  try {
    return await response.json();
  } catch {
    throw new HttpApiResponseError(
      `API returned invalid JSON (${response.status}).`,
      { retryable, statusCode: response.status },
    );
  }
}

async function assertSuccessfulResponse(response: Response) {
  if (response.ok) return;

  const retryableStatus = [408, 423, 429, 502, 503, 504].includes(
    response.status,
  );
  let apiError;

  try {
    apiError = parseApiV1Error(
      await readResponseJson(response, retryableStatus),
    );
  } catch (error) {
    if (error instanceof HttpApiResponseError) throw error;
    throw new HttpApiResponseError(
      `API request failed (${response.status}).`,
      { retryable: retryableStatus, statusCode: response.status },
    );
  }

  throw new HttpApiResponseError(apiError.message, {
    apiCode: apiError.code,
    details: apiError.details ?? null,
    retryable: retryableStatus ||
      apiError.code === "repository_busy" ||
      apiError.code === "adapter_unavailable",
    statusCode: response.status,
  });
}

export async function requestApiJson(
  fetchFn: typeof fetch,
  baseUrl: string,
  endpoint: string,
  init?: RequestInit,
  token?: string,
): Promise<unknown> {
  const controller = new AbortController();
  const headers = new Headers(init?.headers);

  if (token) headers.set("Authorization", `Bearer ${token}`);

  const abortFromCaller = () => controller.abort(init?.signal?.reason);

  init?.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = globalThis.setTimeout(
    () =>
      controller.abort(
        new DOMException("API request timed out", "TimeoutError"),
      ),
    apiRequestTimeoutMs,
  );

  try {
    const response = await fetchFn(resolveApiUrl(baseUrl, endpoint), {
      ...init,
      headers,
      signal: controller.signal,
    });

    await assertSuccessfulResponse(response);
    return await readResponseJson(response);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpApiUnavailableError(
        controller.signal.reason instanceof Error
          ? controller.signal.reason.message
          : "API request failed or timed out.",
      );
    }
    if (error instanceof HttpApiResponseError) throw error;
    if (
      error instanceof TypeError ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new HttpApiUnavailableError(
        controller.signal.reason instanceof Error
          ? controller.signal.reason.message
          : "API request failed or timed out.",
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", abortFromCaller);
  }
}
