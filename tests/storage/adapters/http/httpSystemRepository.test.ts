import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { createBrowserSystemRepositoryCatalog } from "../../../../src/storage/adapters/browser/browserSystemRepository";
import { createBrowserSystemRepositoryStorage } from "../../../../src/storage/adapters/browser/browserSystemRepositoryStorage";
import { createHttpSystemRepositoryBackend } from "../../../../src/storage/adapters/http/httpSystemRepository";
import { createHttpSystemRepositoryCatalog } from "../../../../src/storage/adapters/http/httpSystemRepositoryCatalog";
import type { SystemRepositoryRevision } from "../../../../src/storage/repository/systemRepository";

const revisionA = `sha256:${"a".repeat(64)}` as SystemRepositoryRevision;
const revisionB = `sha256:${"b".repeat(64)}` as SystemRepositoryRevision;
const journalContent = {
  entries: [],
  purpose: "system-journal" as const,
  schemaVersion: 1 as const,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function serverCatalog(prefix = "/state") {
  return {
    issues: [],
    repositories: [
      {
        id: "system-journal",
        label: "日记",
        location: {
          serverPath: `${prefix}/system-journal`,
          type: "server",
        },
        protected: true,
      },
      {
        id: "system-todo",
        label: "代办",
        location: {
          serverPath: `${prefix}/system-todo`,
          type: "server",
        },
        protected: true,
      },
    ],
  } as const;
}

const offlineFetch: typeof fetch = async () => {
  throw new TypeError("offline");
};

describe("HTTP system repositories", () => {
  it("uses purpose-routed snapshot GET and commit PUT contracts", async () => {
    const calls: Array<{
      body: BodyInit | null | undefined;
      method: string;
      url: string;
    }> = [];
    const backend = createHttpSystemRepositoryBackend({
      baseUrl: "https://api.test/root",
      fetch: async (input, init) => {
        calls.push({
          body: init?.body,
          method: init?.method ?? "GET",
          url: String(input),
        });
        return init?.method === "PUT"
          ? jsonResponse({ revision: revisionB })
          : jsonResponse({ content: journalContent, revision: revisionA });
      },
      purpose: "system-journal",
    });

    await expect(backend.loadRemoteSnapshot()).resolves.toEqual({
      content: journalContent,
      revision: revisionA,
    });
    await expect(backend.commitRemoteSnapshot({
      baseRevision: revisionA,
      content: journalContent,
    })).resolves.toEqual({ revision: revisionB });
    expect(calls).toEqual([
      {
        body: undefined,
        method: "GET",
        url: "https://api.test/root/api/system-repositories/system-journal/snapshot",
      },
      {
        body: JSON.stringify({
          baseRevision: revisionA,
          content: journalContent,
        }),
        method: "PUT",
        url: "https://api.test/root/api/system-repositories/system-journal/snapshot",
      },
    ]);
  });

  it("keeps opened repositories stable and retries with a bodyless POST", async () => {
    const calls: Array<{
      body: BodyInit | null | undefined;
      method: string;
      url: string;
    }> = [];
    const catalog = createHttpSystemRepositoryCatalog({
      baseUrl: "https://api.test/root",
      fetch: async (input, init) => {
        const url = String(input);

        calls.push({
          body: init?.body,
          method: init?.method ?? "GET",
          url,
        });
        if (url.endsWith("/retry")) {
          return jsonResponse({ status: "ready" });
        }
        if (url.endsWith("/snapshot")) {
          return jsonResponse({ content: journalContent, revision: revisionA });
        }
        return jsonResponse(serverCatalog());
      },
    });
    const projection = await catalog.listRepositories();
    const descriptor = projection.repositories[0]!;
    const repository = catalog.openRepository(descriptor);

    expect(catalog.openRepository(descriptor)).toBe(repository);
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: journalContent,
      remoteRevision: revisionA,
    });
    await expect(catalog.retryRepository("system-journal")).resolves.toEqual({
      status: "ready",
    });
    expect(calls.at(-1)).toEqual({
      body: undefined,
      method: "POST",
      url: "https://api.test/root/api/system-repositories/system-journal/retry",
    });
  });

  it("restores both catalog descriptors and snapshots while offline", async () => {
    const storage = createBrowserSystemRepositoryStorage(new IDBFactory());
    const options = {
      baseUrl: "https://cached.test/api",
      cache: storage.cache,
      catalogCache: storage.catalogCache,
      token: "same-token",
    } as const;
    const online = createHttpSystemRepositoryCatalog({
      ...options,
      fetch: async (input) => String(input).endsWith("/snapshot")
        ? jsonResponse({ content: journalContent, revision: revisionA })
        : jsonResponse(serverCatalog("/cached")),
    });
    const projection = await online.listRepositories();

    await online.openRepository(projection.repositories[0]!).loadSnapshot();

    const offline = createHttpSystemRepositoryCatalog({
      ...options,
      fetch: offlineFetch,
    });
    const cachedProjection = await offline.listRepositories();

    expect(cachedProjection).toEqual(projection);
    await expect(
      offline.openRepository(cachedProjection.repositories[0]!).loadSnapshot(),
    ).resolves.toMatchObject({
      content: journalContent,
      remoteRevision: revisionA,
    });
  });

  it("isolates catalog cache by HTTP origin and token and from Browser mode", async () => {
    const storage = createBrowserSystemRepositoryStorage(new IDBFactory());
    const browserCatalog = createBrowserSystemRepositoryCatalog({ storage });

    await browserCatalog.listRepositories();

    const onlineA = createHttpSystemRepositoryCatalog({
      baseUrl: "https://a.test/api",
      cache: storage.cache,
      catalogCache: storage.catalogCache,
      fetch: async () => jsonResponse(serverCatalog("/a")),
      token: "token-a",
    });
    const projectionA = await onlineA.listRepositories();

    await expect(createHttpSystemRepositoryCatalog({
      baseUrl: "https://a.test/other-path",
      cache: storage.cache,
      catalogCache: storage.catalogCache,
      fetch: offlineFetch,
      token: "token-a",
    }).listRepositories()).resolves.toEqual(projectionA);
    await expect(createHttpSystemRepositoryCatalog({
      baseUrl: "https://b.test/api",
      cache: storage.cache,
      catalogCache: storage.catalogCache,
      fetch: offlineFetch,
      token: "token-a",
    }).listRepositories()).rejects.toThrow("failed or timed out");
    await expect(createHttpSystemRepositoryCatalog({
      baseUrl: "https://a.test/api",
      cache: storage.cache,
      catalogCache: storage.catalogCache,
      fetch: offlineFetch,
      token: "token-b",
    }).listRepositories()).rejects.toThrow("failed or timed out");
    await expect(createHttpSystemRepositoryCatalog({
      baseUrl: "https://browser-cache-must-not-leak.test/api",
      cache: storage.cache,
      catalogCache: storage.catalogCache,
      fetch: offlineFetch,
    }).listRepositories()).rejects.toThrow("failed or timed out");
  });

  it("does not mask a non-offline invalid catalog response with cached data", async () => {
    const storage = createBrowserSystemRepositoryStorage(new IDBFactory());
    const common = {
      baseUrl: "https://invalid.test/api",
      cache: storage.cache,
      catalogCache: storage.catalogCache,
    } as const;

    await createHttpSystemRepositoryCatalog({
      ...common,
      fetch: async () => jsonResponse(serverCatalog()),
    }).listRepositories();
    const invalidFetch = vi.fn<typeof fetch>(async () => jsonResponse({}));

    await expect(createHttpSystemRepositoryCatalog({
      ...common,
      fetch: invalidFetch,
    }).listRepositories()).rejects.toThrow("missing field");
    expect(invalidFetch).toHaveBeenCalledTimes(1);
  });
});
