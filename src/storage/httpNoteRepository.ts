import type { NoteWorkspace } from "../domain/notes";
import type {
  NoteRepository,
  RepositoryInfo,
  SyntaxProfileFile,
} from "./noteRepository";

type HttpNoteRepositoryOptions = {
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

async function requestJson<T>(
  fetchFn: typeof fetch,
  baseUrl: string,
  endpoint: string,
): Promise<T> {
  const response = await fetchFn(resolveApiUrl(baseUrl, endpoint));

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as T;
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

export function createHttpNoteRepository({
  baseUrl = "http://127.0.0.1:3001",
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
}: HttpNoteRepositoryOptions = {}): NoteRepository {
  return {
    label: "HTTP 后端",
    canChangeRepositoryPath: false,
    async loadWorkspace() {
      return requestJson<NoteWorkspace | null>(fetchFn, baseUrl, "/api/workspace");
    },
    async saveWorkspace(workspace) {
      await sendJson(fetchFn, baseUrl, "/api/workspace", "PUT", workspace);
    },
    async clearWorkspace() {
      await sendJson(fetchFn, baseUrl, "/api/workspace", "DELETE");
    },
    async getRepositoryInfo(): Promise<RepositoryInfo> {
      return requestJson<RepositoryInfo>(fetchFn, baseUrl, "/api/repository");
    },
    async listSyntaxFiles() {
      return requestJson<SyntaxProfileFile[]>(fetchFn, baseUrl, "/api/syntax");
    },
    async readSyntaxFile(fileName) {
      return requestJson<SyntaxProfileFile>(
        fetchFn,
        baseUrl,
        `/api/syntax/${encodeURIComponent(fileName)}`,
      );
    },
    async saveSyntaxFile(fileName, source) {
      await sendJson(
        fetchFn,
        baseUrl,
        `/api/syntax/${encodeURIComponent(fileName)}`,
        "PUT",
        { source },
      );
    },
    async deleteSyntaxFile(fileName) {
      await sendJson(
        fetchFn,
        baseUrl,
        `/api/syntax/${encodeURIComponent(fileName)}`,
        "DELETE",
      );
    },
  };
}
