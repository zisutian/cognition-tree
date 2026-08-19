import { parseApiV1Error } from "../../../contracts/api/parseError";
import { parseRepositoryRevision } from "../../../contracts/workspace/revision";
import {
  WorkspaceRepositoryBackendConflictError,
  WorkspaceRepositoryRemoteError,
  WorkspaceRepositoryUnavailableError,
} from "../../../application/workspace/persistence/workspaceRepository";

export const repositoryRequestTimeoutMs = 30_000;

export type HttpRepositoryTransportOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
  token?: string;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export function resolveRepositoryApiUrl(baseUrl: string, endpoint: string) {
  return new URL(
    endpoint.replace(/^\//, ""),
    normalizeBaseUrl(baseUrl),
  ).toString();
}

async function readResponseJson(response: Response, retryable = false) {
  try {
    return await response.json();
  } catch {
    throw new WorkspaceRepositoryRemoteError(
      `Repository returned invalid JSON (${response.status}).`,
      { retryable },
    );
  }
}

async function assertSuccessfulResponse(response: Response) {
  if (response.ok) {
    return;
  }

  const retryableStatus = [408, 423, 429, 502, 503, 504].includes(
    response.status,
  );

  let apiError;

  try {
    apiError = parseApiV1Error(
      await readResponseJson(response, retryableStatus),
    );
  } catch (error) {
    if (error instanceof WorkspaceRepositoryRemoteError) {
      throw error;
    }

    throw new WorkspaceRepositoryRemoteError(
      `Repository request failed (${response.status}).`,
      { retryable: retryableStatus },
    );
  }

  if (
    apiError.code === "resource_conflict" &&
    typeof apiError.details?.currentRevision === "string"
  ) {
    throw new WorkspaceRepositoryBackendConflictError(
      parseRepositoryRevision(apiError.details.currentRevision),
    );
  }

  const retryable =
    retryableStatus ||
    apiError.code === "repository_busy" ||
    apiError.code === "adapter_unavailable";
  const code = apiError.code === "not_found"
    ? "repository_not_found"
    : apiError.code === "domain_validation_failed" ||
        apiError.code === "idempotency_conflict" ||
        apiError.code === "occurrence_conflict"
      ? "invalid_request"
      : apiError.code === "forbidden"
        ? "unauthorized"
        : apiError.code === "resource_conflict"
          ? "revision_conflict"
          : apiError.code === "adapter_unavailable" ||
              apiError.code === "insufficient_storage" ||
              apiError.code === "internal_error" ||
              apiError.code === "invalid_request" ||
              apiError.code === "repository_busy" ||
              apiError.code === "repository_corrupt" ||
              apiError.code === "unauthorized"
            ? apiError.code
            : "internal_error";

  throw new WorkspaceRepositoryRemoteError(apiError.message, {
    code,
    retryable,
  });
}

export async function createHttpRepositoryCacheIdentity({
  baseUrl,
  repositoryId,
  token,
}: {
  baseUrl: string;
  repositoryId: string;
  token?: string;
}) {
  const normalizedOrigin = new URL(normalizeBaseUrl(baseUrl)).origin;
  const tokenBytes = new TextEncoder().encode(token ?? "");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", tokenBytes);
  const tokenDigest = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `${normalizedOrigin}#${repositoryId}#${tokenDigest}`;
}

export async function requestRepositoryJson(
  fetchFn: typeof fetch,
  baseUrl: string,
  endpoint: string,
  init?: RequestInit,
  token?: string,
): Promise<unknown> {
  const controller = new AbortController();
  const headers = new Headers(init?.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const abortFromCaller = () => controller.abort(init?.signal?.reason);

  init?.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = globalThis.setTimeout(
    () => controller.abort(new DOMException("Repository request timed out", "TimeoutError")),
    repositoryRequestTimeoutMs,
  );

  try {
    const response = await fetchFn(resolveRepositoryApiUrl(baseUrl, endpoint), {
      ...init,
      headers,
      signal: controller.signal,
    });

    await assertSuccessfulResponse(response);
    return await readResponseJson(response);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new WorkspaceRepositoryUnavailableError(
        controller.signal.reason instanceof Error
          ? controller.signal.reason.message
          : "Repository request failed or timed out.",
      );
    }

    if (
      error instanceof WorkspaceRepositoryBackendConflictError ||
      error instanceof WorkspaceRepositoryRemoteError
    ) {
      throw error;
    }

    if (
      error instanceof TypeError ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new WorkspaceRepositoryUnavailableError(
        controller.signal.reason instanceof Error
          ? controller.signal.reason.message
          : "Repository request failed or timed out.",
      );
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", abortFromCaller);
  }
}
