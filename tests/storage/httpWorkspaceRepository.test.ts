import { describe, expect, it } from "vitest";
import { createInitialWorkspaceData } from "../../src/workspace/model/workspaceData";
import { createHttpWorkspaceRepository } from "../../src/storage/httpWorkspaceRepository";

type FetchCall = {
  body?: BodyInit | null;
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
  it("loads repository info and workspace through HTTP", async () => {
    const workspace = createInitialWorkspaceData();
    const calls: FetchCall[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        method: init?.method ?? "GET",
        url: String(input),
      });

      if (String(input).endsWith("/api/repository")) {
        return jsonResponse({ path: "/data/repository" });
      }

      if (String(input).endsWith("/api/workspace")) {
        return jsonResponse(workspace);
      }

      return jsonResponse({ error: "not found" }, 404);
    };
    const repository = createHttpWorkspaceRepository({
      baseUrl: "http://api.test/base/",
      fetch: fetchMock,
    });

    await expect(repository.getRepositoryInfo()).resolves.toEqual({
      path: "/data/repository",
    });
    await expect(repository.loadWorkspace()).resolves.toEqual(workspace);
    expect(repository.label).toBe("HTTP 后端");
    expect(repository.canChangeRepositoryPath).toBe(false);
    expect(calls.map((call) => call.url)).toEqual([
      "http://api.test/base/api/repository",
      "http://api.test/base/api/workspace",
    ]);
  });

  it("saves and clears workspaces through HTTP", async () => {
    const workspace = createInitialWorkspaceData();
    const calls: FetchCall[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(null, { status: 204 });
    };
    const repository = createHttpWorkspaceRepository({
      baseUrl: "http://api.test",
      fetch: fetchMock,
    });

    await repository.saveWorkspace(workspace);
    await repository.clearWorkspace();

    expect(calls).toEqual([
      {
        body: JSON.stringify(workspace),
        method: "PUT",
        url: "http://api.test/api/workspace",
      },
      {
        body: undefined,
        method: "DELETE",
        url: "http://api.test/api/workspace",
      },
    ]);
  });

  it("reports server errors", async () => {
    const fetchMock: typeof fetch = async () => {
      return jsonResponse({ error: "backend failed" }, 500);
    };
    const repository = createHttpWorkspaceRepository({ fetch: fetchMock });

    await expect(repository.loadWorkspace()).rejects.toThrow("backend failed");
  });

  it("loads raw workspace syntax source responses", async () => {
    const source = 'name = "默认 CTN 语法"\n';
    const fetchMock: typeof fetch = async () =>
      jsonResponse({
        fileName: "workspace.toml",
        source,
      });
    const repository = createHttpWorkspaceRepository({ fetch: fetchMock });

    await expect(repository.readWorkspaceSyntaxSourceFile()).resolves.toEqual({
      fileName: "workspace.toml",
      source,
    });
  });

  it("reports missing workspace syntax without applying defaults", async () => {
    const fetchMock: typeof fetch = async () => jsonResponse(null);
    const repository = createHttpWorkspaceRepository({ fetch: fetchMock });

    await expect(repository.readWorkspaceSyntaxSourceFile()).resolves.toBeNull();
  });

  it("sends workspace syntax source without parsing it", async () => {
    const calls: FetchCall[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(null, { status: 204 });
    };
    const repository = createHttpWorkspaceRepository({ fetch: fetchMock });

    await repository.saveWorkspaceSyntaxSource('name = "broken"\n');

    expect(calls).toEqual([
      {
        body: JSON.stringify({ source: 'name = "broken"\n' }),
        method: "PUT",
        url: "http://127.0.0.1:3001/api/syntax",
      },
    ]);
  });

  it("rejects obsolete response shapes", async () => {
    const workspace = {
      ...createInitialWorkspaceData(),
      syntaxProfile: {},
    };
    const fetchMock: typeof fetch = async (input) => {
      if (String(input).endsWith("/api/syntax")) {
        return jsonResponse([]);
      }

      return jsonResponse(workspace);
    };
    const repository = createHttpWorkspaceRepository({ fetch: fetchMock });

    await expect(repository.loadWorkspace()).rejects.toThrow(
      "unsupported field",
    );
    await expect(repository.readWorkspaceSyntaxSourceFile()).rejects.toThrow(
      "expected object",
    );
  });
});
