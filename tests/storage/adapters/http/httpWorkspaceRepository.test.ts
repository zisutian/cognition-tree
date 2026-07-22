import { afterEach, describe, expect, it, vi } from "vitest";
import { UnsupportedRepositoryVersionError } from "../../../../contracts/workspace/contractValue";
import { serializeJsonIteratively } from "../../../../contracts/common/json";
import { parseWorkspaceRepositoryCommit } from "../../../../contracts/workspace/parseRepository";
import { createHttpWorkspaceRepositoryBackend } from "../../../../infrastructure/http/httpWorkspaceRepository";
import {
  createHttpRepositoryCacheIdentity,
  repositoryRequestTimeoutMs,
} from "../../../../infrastructure/http/httpRepositoryTransport";
import {
  WorkspaceRepositoryBackendConflictError,
  WorkspaceRepositoryRemoteError,
  WorkspaceRepositoryUnavailableError,
} from "../../../../application/repository/workspaceRepository";
import {
  createDeepRepositoryContent,
  createRepositoryContent,
  inspectDeepRepositoryContent,
  revisionA,
  revisionB,
} from "../../repositoryV3Fixtures";

type FetchCall = {
  body?: BodyInit | null;
  headers: Headers;
  method: string;
  signal?: AbortSignal | null;
  url: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function apiError(
  code: string,
  message: string,
  requestId = "request-1",
  extra: Record<string, unknown> = {},
) {
  return { code, message, requestId, ...extra };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("HTTP workspace repository backend", () => {
  it("round-trips a 10,000-level tree through response and request wire encoding", async () => {
    const content = createDeepRepositoryContent(10_000);
    let receivedCommit: ReturnType<typeof parseWorkspaceRepositoryCommit> | null = null;
    const backend = createHttpWorkspaceRepositoryBackend({
      fetch: async (_input, init) => {
        if ((init?.method ?? "GET") === "GET") {
          return new Response(serializeJsonIteratively({
            content,
            revision: revisionA,
          }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        if (typeof init?.body !== "string") {
          throw new Error("Expected the deep commit to use a JSON string body.");
        }
        receivedCommit = parseWorkspaceRepositoryCommit(JSON.parse(init.body));
        return jsonResponse({ revision: revisionB });
      },
      repositoryId: "deep",
    });
    const loaded = await backend.loadRemoteSnapshot();

    expect(loaded.revision).toBe(revisionA);
    expect(inspectDeepRepositoryContent(loaded.content)).toEqual({
      deepestFolder: {
        folderId: "folder-10000",
        title: 'Level 10000 · "深层"',
      },
      depth: 10_000,
      leaf: { kind: "note", noteId: "deep-note" },
      rootFolder: { folderId: "folder-1", title: 'Level 1 · "深层"' },
    });
    await expect(backend.commitRemoteSnapshot({
      baseRevision: loaded.revision,
      content: loaded.content,
    })).resolves.toEqual({ revision: revisionB });
    expect(receivedCommit).not.toBeNull();
    expect(inspectDeepRepositoryContent(receivedCommit!.content)).toEqual({
      deepestFolder: {
        folderId: "folder-10000",
        title: 'Level 10000 · "深层"',
      },
      depth: 10_000,
      leaf: { kind: "note", noteId: "deep-note" },
      rootFolder: { folderId: "folder-1", title: 'Level 1 · "深层"' },
    });
    expect(receivedCommit!.content.workspace.notes).toEqual(content.workspace.notes);
  });

  it("loads an explicit v4 content snapshot", async () => {
    const snapshot = {
      content: createRepositoryContent("Remote"),
      revision: revisionA,
    };
    const calls: FetchCall[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        headers: new Headers(init?.headers),
        method: init?.method ?? "GET",
        signal: init?.signal,
        url: String(input),
      });
      return jsonResponse(snapshot);
    };
    const backend = createHttpWorkspaceRepositoryBackend({
      baseUrl: "http://api.test/base/",
      fetch: fetchMock,
      repositoryId: "primary",
    });

    await expect(backend.loadRemoteSnapshot()).resolves.toEqual(snapshot);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "http://api.test/base/api/repositories/primary/snapshot",
    });
  });

  it("commits baseRevision and content as one request", async () => {
    const commit = {
      baseRevision: revisionA,
      content: createRepositoryContent("Committed"),
    };
    const calls: FetchCall[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        headers: new Headers(init?.headers),
        method: init?.method ?? "GET",
        signal: init?.signal,
        url: String(input),
      });
      return jsonResponse({ revision: revisionB });
    };
    const backend = createHttpWorkspaceRepositoryBackend({
      baseUrl: "http://api.test",
      fetch: fetchMock,
      repositoryId: "primary",
      token: "client-token",
    });

    await expect(backend.commitRemoteSnapshot(commit)).resolves.toEqual({
      revision: revisionB,
    });
    expect(calls[0]?.body).toBe(JSON.stringify(commit));
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.headers.get("Content-Type")).toBe("application/json");
    expect(calls[0]?.headers.get("Authorization")).toBe(
      "Bearer client-token",
    );
  });

  it("rejects invalid outbound exact content and unsafe note paths before fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const backend = createHttpWorkspaceRepositoryBackend({
      fetch: fetchMock,
      repositoryId: "primary",
    });
    const exactContent = createRepositoryContent();

    Object.assign(exactContent.workspace.notes[0]!, {
      title: "derived field must not cross the wire",
    });
    await expect(backend.commitRemoteSnapshot({
      baseRevision: revisionA,
      content: exactContent,
    })).rejects.toThrow("unsupported field");

    const unsafeContent = createRepositoryContent();

    unsafeContent.workspace.notes = [{ id: "../escape", source: "unsafe" }];
    unsafeContent.workspace.tree = [{ kind: "note", noteId: "../escape" }];
    await expect(backend.commitRemoteSnapshot({
      baseRevision: revisionA,
      content: unsafeContent,
    })).rejects.toThrow("invalid repository note id");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps only structured revision conflicts to the backend conflict type", async () => {
    const backend = createHttpWorkspaceRepositoryBackend({
      fetch: async () =>
        jsonResponse(
          apiError("revision_conflict", "content changed", "request-2", {
            currentRevision: revisionB,
          }),
          409,
        ),
      repositoryId: "primary",
    });

    await expect(
      backend.commitRemoteSnapshot({
        baseRevision: revisionA,
        content: createRepositoryContent(),
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<WorkspaceRepositoryBackendConflictError>>({
        currentRevision: revisionB,
      }),
    );
  });

  it("classifies retryable and terminal structured errors without retrying", async () => {
    const transientFetch = vi.fn(async () =>
      jsonResponse(apiError("adapter_unavailable", "temporarily offline"), 503),
    );
    const terminalFetch = vi.fn(async () =>
      jsonResponse(apiError("repository_corrupt", "repository is corrupt"), 500),
    );
    const transient = createHttpWorkspaceRepositoryBackend({
      fetch: transientFetch,
      repositoryId: "primary",
    });
    const terminal = createHttpWorkspaceRepositoryBackend({
      fetch: terminalFetch,
      repositoryId: "primary",
    });

    await expect(transient.loadRemoteSnapshot()).rejects.toEqual(
      expect.objectContaining<Partial<WorkspaceRepositoryRemoteError>>({
        message: "temporarily offline",
        retryable: true,
      }),
    );
    await expect(terminal.loadRemoteSnapshot()).rejects.toEqual(
      expect.objectContaining<Partial<WorkspaceRepositoryRemoteError>>({
        message: "repository is corrupt",
        retryable: false,
      }),
    );
    expect(transientFetch).toHaveBeenCalledTimes(1);
    expect(terminalFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps retryable HTTP status semantics when a gateway returns invalid JSON", async () => {
    const backend = createHttpWorkspaceRepositoryBackend({
      fetch: async () => new Response("bad gateway", { status: 503 }),
      repositoryId: "primary",
    });

    await expect(backend.loadRemoteSnapshot()).rejects.toEqual(
      expect.objectContaining<Partial<WorkspaceRepositoryRemoteError>>({
        retryable: true,
      }),
    );
  });

  it("rejects v3 snapshots instead of reading compatibility content", async () => {
    const backend = createHttpWorkspaceRepositoryBackend({
      fetch: async () =>
        jsonResponse({
          content: {
            schemaVersion: 3,
            syntaxSource: null,
            workspace: { id: "old", name: "Old", notes: [], tree: [] },
          },
          revision: revisionA,
        }),
      repositoryId: "primary",
    });

    await expect(backend.loadRemoteSnapshot()).rejects.toBeInstanceOf(
      UnsupportedRepositoryVersionError,
    );
  });

  it("aborts every request after the fixed 30 second timeout", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const backend = createHttpWorkspaceRepositoryBackend({
      fetch: async (_input, init) => {
        observedSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          observedSignal?.addEventListener("abort", () =>
            reject(observedSignal?.reason),
          );
        });
      },
      repositoryId: "primary",
    });
    const request = backend.loadRemoteSnapshot();
    const rejection = expect(request).rejects.toBeInstanceOf(
      WorkspaceRepositoryUnavailableError,
    );

    await vi.advanceTimersByTimeAsync(repositoryRequestTimeoutMs);

    await rejection;
    expect(observedSignal?.aborted).toBe(true);
  });

  it("keeps the timeout active while consuming a stalled response body", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const backend = createHttpWorkspaceRepositoryBackend({
      fetch: async (_input, init) => {
        observedSignal = init?.signal ?? undefined;
        return {
          json: () => new Promise((_resolve, reject) => {
            observedSignal?.addEventListener("abort", () =>
              reject(observedSignal?.reason),
            );
          }),
          ok: true,
          status: 200,
        } as Response;
      },
      repositoryId: "primary",
    });
    const request = backend.loadRemoteSnapshot();
    const rejection = expect(request).rejects.toBeInstanceOf(
      WorkspaceRepositoryUnavailableError,
    );

    await vi.advanceTimersByTimeAsync(repositoryRequestTimeoutMs);

    await rejection;
    expect(observedSignal?.aborted).toBe(true);
  });

  it("keys local cache identity by origin, repository id, and token digest", async () => {
    const first = await createHttpRepositoryCacheIdentity({
      baseUrl: "https://api.test/path-a",
      repositoryId: "primary",
      token: "token-a",
    });
    const sameOrigin = await createHttpRepositoryCacheIdentity({
      baseUrl: "https://api.test/path-b",
      repositoryId: "primary",
      token: "token-a",
    });
    const anotherToken = await createHttpRepositoryCacheIdentity({
      baseUrl: "https://api.test/path-a",
      repositoryId: "primary",
      token: "token-b",
    });

    expect(first).toBe(sameOrigin);
    expect(first).not.toBe(anotherToken);
    expect(first).not.toContain("token-a");
  });
});
