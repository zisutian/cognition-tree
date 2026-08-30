import { describe, expect, it, vi } from "vitest";
import { createMemoryRepositoryClientCache } from "../../../../infrastructure/client/repository/repositoryClientCache";
import { createHttpWorkspaceRepositoryCatalog } from "../../../../infrastructure/client/http/workspaceRepositoryCatalog";
import { createHttpRepositoryCacheIdentity } from "../../../../infrastructure/client/http/httpRepositoryIdentity";
import {
  createWorkspaceRepositoryContent,
  revisionA,
  revisionC,
} from "../../../support/workspaceRepositoryFixtures";
import type { WorkspaceRepositoryPreparation } from "../../../../application/workspace/persistence/workspaceRepositoryPreparation";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

const descriptor = {
  id: "primary",
  label: "Stable label",
  location: {
    hostPath: "/home/user/repositories/primary",
    serverPath: "/data/repositories/primary",
  },
  labelIssue: null,
};
const issue = {
  code: "repository_corrupt" as const,
  id: "broken",
  location: null,
  message: "Repository head is invalid",
};
const serverCatalog = {
  issues: [issue],
  repositories: [descriptor],
};

describe("HTTP workspace repository catalog", () => {
  const preparation = {
    prepare() {
      return {} as WorkspaceRepositoryPreparation;
    },
  };

  it("lists healthy repositories separately from per-repository issues", async () => {
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test/base",
      fetch: async () => jsonResponse(serverCatalog),
      preparation,
    });

    await expect(catalog.listRepositories()).resolves.toEqual({
      issues: [issue],
      repositories: [descriptor],
    });
  });

  it("creates v4 content with an explicit stable catalog label", async () => {
    const calls: Array<{ body?: BodyInit | null; method: string; url: string }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        method: init?.method ?? "GET",
        url: String(input),
      });
      return jsonResponse(descriptor, 201);
    };
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test/base",
      fetch: fetchMock,
      preparation,
    });
    const input = {
      content: createWorkspaceRepositoryContent("Workspace name"),
      label: "Stable label",
    };

    await expect(catalog.createRepository(input)).resolves.toEqual(descriptor);
    expect(calls).toEqual([
      {
        body: JSON.stringify(input),
        method: "POST",
        url: "http://api.test/base/api/v3/admin/repositories",
      },
    ]);
  });

  it("renames only catalog metadata through PATCH and refreshes the cache", async () => {
    const cache = createMemoryRepositoryClientCache();
    const calls: Array<{ body?: BodyInit | null; method: string; url: string }> = [];
    const renamed = { ...descriptor, label: "Renamed" };
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test/base",
      cache,
      fetch: async (input, init) => {
        calls.push({
          body: init?.body,
          method: init?.method ?? "GET",
          url: String(input),
        });
        return init?.method === "PATCH"
          ? jsonResponse(renamed)
          : jsonResponse(serverCatalog);
      },
      preparation,
    });

    await catalog.listRepositories();
    await expect(catalog.renameRepository({
      id: descriptor.id,
      label: "  Renamed  ",
    })).resolves.toEqual(renamed);
    const catalogIdentity = await createHttpRepositoryCacheIdentity({
      baseUrl: "http://api.test/base",
      repositoryId: "__catalog__",
    });

    await expect(cache.catalogs.load(catalogIdentity)).resolves.toMatchObject({
      repositories: [renamed],
    });
    expect(calls[1]).toEqual({
      body: JSON.stringify({ label: "Renamed" }),
      method: "PATCH",
      url: "http://api.test/base/api/v3/admin/repositories/primary",
    });
  });

  it("does not send an invalid exact create DTO", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test",
      fetch: fetchMock,
      preparation,
    });
    const input = {
      content: createWorkspaceRepositoryContent(),
      label: "Primary",
      repositoryPath: "/must/not/cross/the/wire",
    };

    await expect(catalog.createRepository(input)).rejects.toThrow(
      "unsupported field",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens an id-routed backend behind the local-first repository port", async () => {
    const requestedUrls: string[] = [];
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test",
      fetch: async (input) => {
        requestedUrls.push(String(input));
        return jsonResponse({
          content: createWorkspaceRepositoryContent("Remote"),
          revision: revisionA,
        });
      },
      preparation,
    });
    const repository = catalog.openRepository(descriptor);

    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "Remote" } },
      pendingChanges: false,
      remoteRevision: revisionA,
    });
    expect(repository.label).toBe("Stable label");
    expect(repository.location).toEqual(descriptor.location);
    expect(requestedUrls).toEqual([
      "http://api.test/api/v3/sync/workspaces/primary",
    ]);
  });

  it("keeps pending edits only for the lifetime of one client cache", async () => {
    const fetchRemote: typeof fetch = async () =>
      jsonResponse({
        content: createWorkspaceRepositoryContent("Remote"),
        revision: revisionA,
      });
    const firstCatalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test",
      cache: createMemoryRepositoryClientCache(),
      fetch: fetchRemote,
      preparation,
    });
    const firstRepository = firstCatalog.openRepository(descriptor);
    const initial = await firstRepository.loadSnapshot();

    const pendingContent = createWorkspaceRepositoryContent("Unsynchronized");

    await firstRepository.stageSnapshot({
      after: {
        content: pendingContent,
        projection: preparation.prepare(),
      },
      baseLocalRevision: initial.localRevision,
      before: {
        content: initial.content,
        projection: initial.projection,
      },
    });
    await expect(firstRepository.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "Unsynchronized" } },
      pendingChanges: true,
    });

    const recreatedRepository = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test",
      cache: createMemoryRepositoryClientCache(),
      fetch: fetchRemote,
      preparation,
    }).openRepository(descriptor);

    await expect(recreatedRepository.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "Remote" } },
      pendingChanges: false,
    });
  });

  it("refreshes the server-backed local working tree on every load", async () => {
    let loadCount = 0;
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test",
      fetch: async () => {
        loadCount += 1;
        return jsonResponse({
          content: createWorkspaceRepositoryContent(`Remote ${loadCount}`),
          revision: loadCount === 1 ? revisionA : revisionC,
        });
      },
      preparation,
    });
    const repository = catalog.openRepository(descriptor);

    await repository.loadSnapshot();
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "Remote 2" } },
    });
    expect(loadCount).toBe(2);
  });

  it("reuses the complete cached catalog only for offline failures", async () => {
    const cache = createMemoryRepositoryClientCache();
    let unavailable = false;
    const fetchMock = vi.fn<typeof fetch>(async () => {
      if (unavailable) {
        throw new TypeError("network unavailable");
      }
      return jsonResponse(serverCatalog);
    });
    const createCatalog = () =>
      createHttpWorkspaceRepositoryCatalog({
        baseUrl: "http://api.test",
        cache,
        fetch: fetchMock,
        token: "token-a",
      preparation,
      });

    await expect(createCatalog().listRepositories()).resolves.toEqual({
      issues: [issue],
      repositories: [descriptor],
    });
    unavailable = true;
    await expect(createCatalog().listRepositories()).resolves.toEqual({
      issues: [issue],
      repositories: [descriptor],
    });
  });

  it("does not hide terminal structured API errors behind cached descriptors", async () => {
    const cache = createMemoryRepositoryClientCache();
    let corrupt = false;
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test",
      cache,
      fetch: async () =>
        corrupt
          ? jsonResponse(
              {
                code: "repository_corrupt",
                details: {},
                message: "catalog metadata is corrupt",
                requestId: "request-9",
                retryable: false,
              },
              500,
            )
          : jsonResponse({ issues: [], repositories: [descriptor] }),
      preparation,
    });

    await catalog.listRepositories();
    corrupt = true;
    await expect(catalog.listRepositories()).rejects.toThrow(
      "catalog metadata is corrupt",
    );
  });

  it("deletes without a mode query and atomically clears cached catalog/state", async () => {
    const cache = createMemoryRepositoryClientCache();
    const atomicDelete = vi.spyOn(cache, "deleteRepositoryAtomically");
    const calls: Array<{ method: string; url: string }> = [];
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test/base",
      cache,
      fetch: async (input, init) => {
        calls.push({ method: init?.method ?? "GET", url: String(input) });
        return new Response(null, { status: 204 });
      },
      token: "token-a",
      preparation,
    });

    await expect(catalog.deleteRepository({
      id: "primary",
    })).resolves.toBeUndefined();
    expect(calls).toEqual([{
      method: "DELETE",
      url: "http://api.test/base/api/v3/admin/repositories/primary",
    }]);
    expect(atomicDelete).toHaveBeenCalledWith(expect.objectContaining({
      repositoryId: "primary",
    }));
  });

  it("reconciles removed remote entries without retaining a ghost descriptor", async () => {
    const cache = createMemoryRepositoryClientCache();
    let present = true;
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test",
      cache,
      fetch: async () => jsonResponse({
        issues: [],
        repositories: present ? [descriptor] : [],
      }),
      preparation,
    });

    await catalog.listRepositories();
    const repositoryIdentity = await createHttpRepositoryCacheIdentity({
      baseUrl: "http://api.test",
      repositoryId: descriptor.id,
    });
    await cache.snapshots.create({
      identity: repositoryIdentity,
      localRevision: `draft:${crypto.randomUUID()}`,
      snapshot: {
        content: createWorkspaceRepositoryContent(),
        revision: revisionA,
      },
    });
    present = false;
    await expect(catalog.listRepositories()).resolves.toEqual({
      issues: [],
      repositories: [],
    });
    const catalogIdentity = await createHttpRepositoryCacheIdentity({
      baseUrl: "http://api.test",
      repositoryId: "__catalog__",
    });
    await expect(cache.catalogs.load(catalogIdentity)).resolves.toMatchObject({
      repositories: [],
    });
    await expect(cache.snapshots.load(repositoryIdentity)).resolves.toBeNull();
  });
});
