import { describe, expect, it } from "vitest";
import { createInitialWorkspaceData } from "../../src/workspace/model/workspaceData";
import { createHttpWorkspaceRepositoryCatalog } from "../../src/storage/httpWorkspaceRepositoryCatalog";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("HTTP workspace repository catalog", () => {
  it("lists and creates repositories through catalog endpoints", async () => {
    const descriptor = {
      adapter: "local" as const,
      id: "primary",
      label: "primary",
      repositoryPath: "/repositories/primary",
    };
    const calls: Array<{ body?: BodyInit | null; method: string; url: string }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        method: init?.method ?? "GET",
        url: String(input),
      });

      return init?.method === "POST"
        ? jsonResponse(descriptor, 201)
        : jsonResponse({ repositories: [descriptor] });
    };
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test/base",
      fetch: fetchMock,
    });
    const content = {
      syntaxSourceFile: null,
      workspace: createInitialWorkspaceData(),
    };

    await expect(catalog.listRepositories()).resolves.toEqual([descriptor]);
    await expect(
      catalog.createRepository({ content, id: "primary" }),
    ).resolves.toEqual(descriptor);
    expect(calls).toEqual([
      {
        body: undefined,
        method: "GET",
        url: "http://api.test/base/api/repositories",
      },
      {
        body: JSON.stringify({ content, id: "primary" }),
        method: "POST",
        url: "http://api.test/base/api/repositories",
      },
    ]);
  });

  it("opens an id-routed snapshot repository", async () => {
    const descriptor = {
      adapter: "local" as const,
      id: "space-id",
      label: "Space",
      repositoryPath: "/repositories/space-id",
    };
    const requestedUrls: string[] = [];
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test",
      fetch: async (input) => {
        requestedUrls.push(String(input));
        return jsonResponse({
          repositoryPath: descriptor.repositoryPath,
          revision: "revision-1",
          syntaxSourceFile: null,
          workspace: createInitialWorkspaceData(),
        });
      },
    });

    await catalog.openRepository(descriptor).loadSnapshot();
    expect(requestedUrls).toEqual([
      "http://api.test/api/repositories/space-id/snapshot",
    ]);
  });
});
