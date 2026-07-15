import { describe, expect, it } from "vitest";
import { createInitialWorkspaceData } from "../../../../src/workspace/model/workspaceData";
import { createHttpWorkspaceRepository } from "../../../../src/storage/adapters/http/httpWorkspaceRepository";
import {
  createWorkspaceRepositorySyntaxSourceFile,
  WorkspaceRepositoryConflictError,
  WorkspaceRepositoryUnavailableError,
  type WorkspaceRepositoryCommit,
} from "../../../../src/storage/repository/workspaceRepository";

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
  it("loads the aggregate repository snapshot", async () => {
    const workspace = createInitialWorkspaceData();
    const snapshot = {
      repositoryPath: "/data/repository",
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

      return jsonResponse(snapshot);
    };
    const repository = createHttpWorkspaceRepository({
      baseUrl: "http://api.test/base/",
      fetch: fetchMock,
      repositoryId: "primary",
    });

    await expect(repository.loadSnapshot()).resolves.toEqual({
      ...snapshot,
      availability: "online",
    });
    expect(repository.label).toBe("primary");
    expect(calls.map((call) => call.url)).toEqual([
      "http://api.test/base/api/repositories/primary/snapshot",
    ]);
  });

  it("commits workspace and syntax as one request", async () => {
    const workspace = createInitialWorkspaceData();
    const commit: WorkspaceRepositoryCommit = {
      baseRevision: "revision-1",
      syntaxSourceFile: createWorkspaceRepositorySyntaxSourceFile(
        'name = "custom"\n',
      ),
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
      repositoryId: "primary",
    });

    await expect(repository.commitSnapshot(commit)).resolves.toEqual({
      availability: "online",
      revision: "revision-2",
    });
    expect(calls).toEqual([
      {
        body: JSON.stringify(commit),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
        url: "http://api.test/api/repositories/primary/snapshot",
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
    const repository = createHttpWorkspaceRepository({
      fetch: fetchMock,
      repositoryId: "primary",
    });
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
    const repository = createHttpWorkspaceRepository({
      fetch: fetchMock,
      repositoryId: "primary",
    });

    await expect(repository.loadSnapshot()).rejects.toThrow("backend failed");
  });

  it("rejects unsupported snapshot fields", async () => {
    const fetchMock: typeof fetch = async () =>
      jsonResponse({
        repositoryPath: "/data/repository",
        revision: "revision-1",
        syntaxSourceFile: null,
        unexpected: true,
        workspace: createInitialWorkspaceData(),
      });
    const repository = createHttpWorkspaceRepository({
      fetch: fetchMock,
      repositoryId: "primary",
    });

    await expect(repository.loadSnapshot()).rejects.toThrow(
      "unsupported field",
    );
  });

  it("adds the configured bearer token to repository requests", async () => {
    let authorization: string | null = null;
    const repository = createHttpWorkspaceRepository({
      fetch: async (_input, init) => {
        authorization = new Headers(init?.headers).get("Authorization");
        return jsonResponse({
          repositoryPath: "/repository",
          revision: "revision-1",
          syntaxSourceFile: null,
          workspace: createInitialWorkspaceData(),
        });
      },
      repositoryId: "primary",
      token: "client-token",
    });

    await repository.loadSnapshot();
    expect(authorization).toBe("Bearer client-token");
  });

  it("classifies network and transient server failures as unavailable", async () => {
    const networkRepository = createHttpWorkspaceRepository({
      fetch: async () => {
        throw new TypeError("network failed");
      },
      repositoryId: "primary",
    });
    const unavailableRepository = createHttpWorkspaceRepository({
      fetch: async () => jsonResponse({ error: "temporarily offline" }, 503),
      repositoryId: "primary",
    });

    await expect(networkRepository.loadSnapshot()).rejects.toBeInstanceOf(
      WorkspaceRepositoryUnavailableError,
    );
    await expect(unavailableRepository.loadSnapshot()).rejects.toBeInstanceOf(
      WorkspaceRepositoryUnavailableError,
    );
  });
});
