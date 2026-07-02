import type {
  WorkspaceRepository,
} from "./workspaceRepository";
import {
  parseRepositoryInfoDto,
  parseWorkspaceDataDto,
  parseWorkspaceSyntaxFileDto,
} from "./workspaceDto";

type HttpWorkspaceRepositoryOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function resolveApiUrl(baseUrl: string, endpoint: string) {
  return new URL(endpoint.replace(/^\//, ""), normalizeBaseUrl(baseUrl)).toString();
}

async function readErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };

    return typeof body.error === "string" ? body.error : response.statusText;
  } catch {
    return response.statusText;
  }
}

async function requestJson(
  fetchFn: typeof fetch,
  baseUrl: string,
  endpoint: string,
): Promise<unknown> {
  const response = await fetchFn(resolveApiUrl(baseUrl, endpoint));

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json();
}

async function sendJson(
  fetchFn: typeof fetch,
  baseUrl: string,
  endpoint: string,
  method: "DELETE" | "PUT",
  body?: unknown,
) {
  const response = await fetchFn(resolveApiUrl(baseUrl, endpoint), {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    method,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

export function createHttpWorkspaceRepository({
  baseUrl = "http://127.0.0.1:3001",
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
}: HttpWorkspaceRepositoryOptions = {}): WorkspaceRepository {
  return {
    label: "HTTP 后端",
    canChangeRepositoryPath: false,
    async loadWorkspace() {
      return parseWorkspaceDataDto(
        await requestJson(fetchFn, baseUrl, "/api/workspace"),
      );
    },
    async saveWorkspace(workspace) {
      await sendJson(fetchFn, baseUrl, "/api/workspace", "PUT", workspace);
    },
    async clearWorkspace() {
      await sendJson(fetchFn, baseUrl, "/api/workspace", "DELETE");
    },
    async getRepositoryInfo() {
      return parseRepositoryInfoDto(
        await requestJson(fetchFn, baseUrl, "/api/repository"),
      );
    },
    async readSyntaxFile() {
      return parseWorkspaceSyntaxFileDto(
        await requestJson(fetchFn, baseUrl, "/api/syntax"),
      );
    },
    async saveSyntaxFile(source) {
      await sendJson(fetchFn, baseUrl, "/api/syntax", "PUT", { source });
    },
  };
}
