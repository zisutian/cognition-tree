import {
  WorkspaceRepositoryConflictError,
  WorkspaceRepositoryUnavailableError,
} from "./workspaceRepository";

export type HttpRepositoryTransportOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function resolveApiUrl(baseUrl: string, endpoint: string) {
  return new URL(
    endpoint.replace(/^\//, ""),
    normalizeBaseUrl(baseUrl),
  ).toString();
}

async function readErrorBody(response: Response) {
  try {
    return (await response.json()) as {
      currentRevision?: unknown;
      error?: unknown;
    };
  } catch {
    return {};
  }
}

async function assertSuccessfulResponse(response: Response) {
  if (response.ok) {
    return;
  }

  const body = await readErrorBody(response);

  if (
    response.status === 409 &&
    typeof body.currentRevision === "string"
  ) {
    throw new WorkspaceRepositoryConflictError(body.currentRevision);
  }

  if ([423, 502, 503, 504].includes(response.status)) {
    throw new WorkspaceRepositoryUnavailableError(
      typeof body.error === "string" ? body.error : response.statusText,
    );
  }

  throw new Error(
    typeof body.error === "string" ? body.error : response.statusText,
  );
}

export async function requestRepositoryJson(
  fetchFn: typeof fetch,
  baseUrl: string,
  endpoint: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetchFn(resolveApiUrl(baseUrl, endpoint), init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new WorkspaceRepositoryUnavailableError();
    }

    throw error;
  }

  await assertSuccessfulResponse(response);
  return response.json();
}
