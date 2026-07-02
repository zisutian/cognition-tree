import { describe, expect, it } from "vitest";
import { createInitialWorkspaceData } from "../../src/domain/notes";
import { createHttpWorkspaceRepository } from "../../src/storage/httpWorkspaceRepository";
import { formatSyntaxProfileToml } from "../../src/syntax/profileToml";

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

  it("parses workspace syntax responses", async () => {
    const source = formatSyntaxProfileToml();
    const fetchMock: typeof fetch = async () =>
      jsonResponse({
        fileName: "workspace.toml",
        source,
      });
    const repository = createHttpWorkspaceRepository({ fetch: fetchMock });

    await expect(repository.readSyntaxFile()).resolves.toMatchObject({
      fileName: "workspace.toml",
      profile: {
        name: "默认 CTN 语法",
      },
      source,
    });
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
    await expect(repository.readSyntaxFile()).rejects.toThrow(
      "expected object",
    );
  });
});
