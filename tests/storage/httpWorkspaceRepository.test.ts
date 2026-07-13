import { describe, expect, it } from "vitest";
import { createInitialWorkspaceData } from "../../src/workspace/model/workspaceData";
import { createHttpWorkspaceRepository } from "../../src/storage/httpWorkspaceRepository";
import { WorkspaceRepositoryConflictError } from "../../src/storage/workspaceRepository";

type FetchCall = {
  body?: BodyInit | null;
  headers?: HeadersInit;
  method: string;
  url: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("createHttpWorkspaceRepository", () => {
  it("loads repository info and the aggregate snapshot", async () => {
    const workspace = createInitialWorkspaceData();
    const snapshot = {
      revision: "revision-1",
      syntaxSourceFile: null,
      workspace,
    };
    const calls: FetchCall[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        headers: init?.headers,
        method: init?.method ?? "GET",
        url: String(input),
      });

      return String(input).endsWith("/api/repository")
        ? jsonResponse({ path: "/data/repository" })
        : jsonResponse(snapshot);
    };
    const repository = createHttpWorkspaceRepository({
      baseUrl: "http://api.test/base/",
      fetch: fetchMock,
    });

    await expect(repository.getRepositoryInfo()).resolves.toEqual({
      path: "/data/repository",
    });
    await expect(repository.loadSnapshot()).resolves.toEqual(snapshot);
    expect(repository.label).toBe("HTTP 后端");
    expect(repository.setRepositoryPath).toBeUndefined();
    expect(calls.map((call) => call.url)).toEqual([
      "http://api.test/base/api/repository",
      "http://api.test/base/api/repository-snapshot",
    ]);
  });

  it("commits workspace and syntax as one request", async () => {
    const workspace = createInitialWorkspaceData();
    const commit = {
      baseRevision: "revision-1",
      syntaxSourceFile: {
        fileName: "workspace.toml",
        source: 'name = "custom"\n',
      },
      workspace,
    };
    const calls: FetchCall[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        headers: init?.headers,
        method: init?.method ?? "GET",
        url: String(input),
      });

      return jsonResponse({ revision: "revision-2" });
    };
    const repository = createHttpWorkspaceRepository({
      baseUrl: "http://api.test",
      fetch: fetchMock,
    });

    await expect(repository.commitSnapshot(commit)).resolves.toEqual({
      revision: "revision-2",
    });
    expect(calls).toEqual([
      {
        body: JSON.stringify(commit),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
        url: "http://api.test/api/repository-snapshot",
      },
    ]);
  });

  it("maps stale revisions to the repository conflict error", async () => {
    const fetchMock: typeof fetch = async () =>
      jsonResponse(
        {
          currentRevision: "revision-current",
          error: "content changed",
        },
        409,
      );
    const repository = createHttpWorkspaceRepository({ fetch: fetchMock });
    const commit = {
      baseRevision: "revision-stale",
      syntaxSourceFile: null,
      workspace: createInitialWorkspaceData(),
    };

    try {
      await repository.commitSnapshot(commit);
      throw new Error("commit should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspaceRepositoryConflictError);
      expect((error as WorkspaceRepositoryConflictError).currentRevision).toBe(
        "revision-current",
      );
    }
  });

  it("reports server errors", async () => {
    const fetchMock: typeof fetch = async () =>
      jsonResponse({ error: "backend failed" }, 500);
    const repository = createHttpWorkspaceRepository({ fetch: fetchMock });

    await expect(repository.loadSnapshot()).rejects.toThrow("backend failed");
  });

  it("rejects obsolete snapshot response shapes", async () => {
    const fetchMock: typeof fetch = async () =>
      jsonResponse({
        revision: "revision-1",
        syntaxProfile: {},
        workspace: createInitialWorkspaceData(),
      });
    const repository = createHttpWorkspaceRepository({ fetch: fetchMock });

    await expect(repository.loadSnapshot()).rejects.toThrow(
      "unsupported field",
    );
  });
});
