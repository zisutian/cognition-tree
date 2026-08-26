// SPDX-License-Identifier: GPL-3.0-or-later

import { parseApiError } from "../../../contracts/api/parseError";
import type { ApiErrorCodeDto } from "../../../contracts/api/types";

export const apiRequestTimeoutMs = 30_000;

export type HttpApiTransportOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
  token?: string;
};

export type OfficialClientApi = Readonly<{ baseUrl: string }>;

export class HttpApiResponseError extends Error {
  apiCode: ApiErrorCodeDto | null;
  details: Record<string, unknown> | null;
  path: string | null;
  requestId: string | null;
  retryable: boolean;
  statusCode: number;

  constructor(
    message: string,
    {
      apiCode = null,
      details = null,
      path = null,
      requestId = null,
      retryable = false,
      statusCode,
    }: {
      apiCode?: ApiErrorCodeDto | null;
      details?: Record<string, unknown> | null;
      path?: string | null;
      requestId?: string | null;
      retryable?: boolean;
      statusCode: number;
    },
  ) {
    super(message);
    this.name = "HttpApiResponseError";
    this.apiCode = apiCode;
    this.details = details;
    this.path = path;
    this.requestId = requestId;
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

  let apiError;

  try {
    apiError = parseApiError(
      await readResponseJson(response),
    );
  } catch (error) {
    if (error instanceof HttpApiResponseError) throw error;
    throw new HttpApiResponseError(
      `API request failed (${response.status}).`,
      { retryable: false, statusCode: response.status },
    );
  }

  throw new HttpApiResponseError(apiError.message, {
    apiCode: apiError.code,
    details: apiError.details,
    path: "issues" in apiError.details &&
        Array.isArray(apiError.details.issues) &&
        typeof apiError.details.issues[0]?.path === "string"
      ? apiError.details.issues[0].path
      : null,
    requestId: apiError.requestId,
    retryable: apiError.retryable,
    statusCode: response.status,
  });
}

async function requestApiResponse<Result>(
  fetchFn: typeof fetch,
  baseUrl: string,
  endpoint: string,
  consumeResponse: (response: Response) => Promise<Result>,
  init?: RequestInit,
  token?: string,
): Promise<Result> {
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
      credentials: "same-origin",
      headers,
      signal: controller.signal,
    });

    await assertSuccessfulResponse(response);
    return await consumeResponse(response);
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

export async function requestApiJson(
  fetchFn: typeof fetch,
  baseUrl: string,
  endpoint: string,
  init?: RequestInit,
  token?: string,
): Promise<unknown> {
  return requestApiResponse(
    fetchFn,
    baseUrl,
    endpoint,
    readResponseJson,
    init,
    token,
  );
}

export async function requestApiNoContent(
  fetchFn: typeof fetch,
  baseUrl: string,
  endpoint: string,
  init?: RequestInit,
  token?: string,
): Promise<void> {
  return requestApiResponse(
    fetchFn,
    baseUrl,
    endpoint,
    async (response) => {
      if (response.status !== 204 || await response.text() !== "") {
        throw new HttpApiResponseError(
          `API returned content where 204 No Content was required (${response.status}).`,
          { statusCode: response.status },
        );
      }
    },
    init,
    token,
  );
}
