// SPDX-License-Identifier: GPL-3.0-or-later

import { parseApiError } from "../../../contracts/api/parseError";
import type { ApiErrorCodeDto } from "../../../contracts/api/types";

export const apiRequestTimeoutMs = 30_000;
export const apiMaximumJsonResponseBytes = 64 * 1024 * 1024;

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

async function rejectResponseBody(
  response: Response,
  message: string,
  retryable: boolean,
): Promise<never> {
  await response.body?.cancel().catch(() => undefined);
  throw new HttpApiResponseError(message, {
    retryable,
    statusCode: response.status,
  });
}

async function readBoundedResponseText(
  response: Response,
  retryable: boolean,
) {
  const contentType = response.headers.get("content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();

  if (contentType !== "application/json") {
    return rejectResponseBody(
      response,
      `API returned a non-JSON content type (${response.status}).`,
      retryable,
    );
  }
  const contentLength = response.headers.get("content-length");

  if (contentLength !== null && !/^\d+$/.test(contentLength)) {
    return rejectResponseBody(
      response,
      `API returned an invalid Content-Length (${response.status}).`,
      retryable,
    );
  }
  if (
    contentLength !== null &&
    Number(contentLength) > apiMaximumJsonResponseBytes
  ) {
    return rejectResponseBody(
      response,
      `API response body exceeds the size limit (${response.status}).`,
      retryable,
    );
  }
  if (!response.body) {
    throw new HttpApiResponseError(
      `API returned no JSON body (${response.status}).`,
      { retryable, statusCode: response.status },
    );
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
      if (size > apiMaximumJsonResponseBytes) {
        throw new HttpApiResponseError(
          `API response body exceeds the size limit (${response.status}).`,
          { retryable, statusCode: response.status },
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
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new HttpApiResponseError(
      `API returned invalid UTF-8 (${response.status}).`,
      { retryable, statusCode: response.status },
    );
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
  const source = await readBoundedResponseText(response, retryable);

  try {
    return JSON.parse(source) as unknown;
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
