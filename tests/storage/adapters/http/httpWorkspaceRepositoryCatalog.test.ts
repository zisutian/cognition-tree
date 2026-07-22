import { describe, expect, it, vi } from "vitest";
import { createMemoryRepositoryClientCache } from "../../../../src/storage/repository/repositoryClientCache";
import { createHttpWorkspaceRepositoryCatalog } from "../../../../src/storage/adapters/http/httpWorkspaceRepositoryCatalog";
import { createHttpRepositoryCacheIdentity } from "../../../../src/storage/adapters/http/httpRepositoryTransport";
import {
  createRepositoryContent,
  revisionA,
  revisionC,
} from "../../repositoryV3Fixtures";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

const descriptor = {
  adapter: "local" as const,
  id: "primary",
  label: "Stable label",
  location: {
    hostPath: "/home/user/repositories/primary",
    serverPath: "/data/repositories/primary",
    type: "local" as const,
  },
  labelIssue: null,
};
const issue = {
  adapter: "local" as const,
  code: "repository_corrupt" as const,
  id: "broken",
  location: null,
  message: "Repository head is invalid",
  status: "fault" as const,
};
const remoteCatalog = {
  creatableAdapters: ["local", "webdav"] as const,
  issues: [issue],
  repositories: [descriptor],
};

describe("HTTP workspace repository catalog", () => {
  const validateContent = () => undefined;

  it("lists healthy repositories separately from per-repository issues", async () => {
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test/base",
      fetch: async () => jsonResponse(remoteCatalog),
      validateContent,
    });

    await expect(catalog.listRepositories()).resolves.toEqual({
      creatableAdapters: ["local", "webdav"],
      issues: [issue],
      repositories: [descriptor],
    });
  });

  it("creates v3 content with an explicit stable catalog label", async () => {
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
      validateContent,
    });
    const input = {
      adapter: "local" as const,
      content: createRepositoryContent("Workspace name"),
      label: "Stable label",
    };

    await expect(catalog.createRepository(input)).resolves.toEqual(descriptor);
    expect(calls).toEqual([
      {
        body: JSON.stringify(input),
        method: "POST",
        url: "http://api.test/base/api/repositories",
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
          : jsonResponse(remoteCatalog);
      },
      validateContent,
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
      url: "http://api.test/base/api/repositories/primary",
    });
  });

  it("does not send an invalid exact create DTO", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const catalog = createHttpWorkspaceRepositoryCatalog({
      fetch: fetchMock,
      validateContent,
    });
    const input = {
      adapter: "local" as const,
      content: createRepositoryContent(),
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
          content: createRepositoryContent("Remote"),
          revision: revisionA,
        });
      },
      validateContent,
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
      "http://api.test/api/repositories/primary/snapshot",
    ]);
  });

  it("refreshes Local working trees on load without making WebDAV cache-first reads remote-first", async () => {
    const createCatalog = (adapter: "local" | "webdav") => {
      let loadCount = 0;
      const catalog = createHttpWorkspaceRepositoryCatalog({
        baseUrl: "http://api.test",
        fetch: async () => {
          loadCount += 1;
          return jsonResponse({
            content: createRepositoryContent(`Remote ${loadCount}`),
            revision: loadCount === 1 ? revisionA : revisionC,
          });
        },
        validateContent,
      });
      const repository = catalog.openRepository(adapter === "local"
        ? descriptor
        : {
            adapter: "webdav",
            id: "remote",
            label: "Remote",
            location: {
              type: "webdav",
              url: "https://dav.example.test/notes/",
            },
            labelIssue: null,
          });

      return { getLoadCount: () => loadCount, repository };
    };
    const local = createCatalog("local");
    const webDav = createCatalog("webdav");

    await local.repository.loadSnapshot();
    await expect(local.repository.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "Remote 2" } },
    });
    await webDav.repository.loadSnapshot();
    await expect(webDav.repository.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "Remote 1" } },
    });
    expect(local.getLoadCount()).toBe(2);
    expect(webDav.getLoadCount()).toBe(1);
  });

  it("reuses the complete cached catalog only for offline failures", async () => {
    const cache = createMemoryRepositoryClientCache();
    let unavailable = false;
    const fetchMock = vi.fn<typeof fetch>(async () => {
      if (unavailable) {
        throw new TypeError("network unavailable");
      }
      return jsonResponse(remoteCatalog);
    });
    const createCatalog = () =>
      createHttpWorkspaceRepositoryCatalog({
        baseUrl: "http://api.test",
        cache,
        fetch: fetchMock,
        token: "token-a",
        validateContent,
      });

    await expect(createCatalog().listRepositories()).resolves.toEqual({
      creatableAdapters: ["local", "webdav"],
      issues: [issue],
      repositories: [descriptor],
    });
    unavailable = true;
    await expect(createCatalog().listRepositories()).resolves.toEqual({
      creatableAdapters: ["local", "webdav"],
      issues: [issue],
      repositories: [descriptor],
    });
  });

  it("does not hide terminal structured API errors behind cached descriptors", async () => {
    const cache = createMemoryRepositoryClientCache();
    let corrupt = false;
    const catalog = createHttpWorkspaceRepositoryCatalog({
      cache,
      fetch: async () =>
        corrupt
          ? jsonResponse(
              {
                code: "repository_corrupt",
                message: "catalog metadata is corrupt",
                requestId: "request-9",
              },
              500,
            )
          : jsonResponse({
              creatableAdapters: ["local", "webdav"],
              issues: [],
              repositories: [descriptor],
            }),
      validateContent,
    });

    await catalog.listRepositories();
    corrupt = true;
    await expect(catalog.listRepositories()).rejects.toThrow(
      "catalog metadata is corrupt",
    );
  });

  it("sends the exact WebDAV create variant without reflecting credentials", async () => {
    const webDavDescriptor = {
      adapter: "webdav" as const,
      id: "remote",
      label: "Remote",
      location: {
        type: "webdav" as const,
        url: "https://dav.example.test/notes/",
      },
      labelIssue: null,
    };
    let body = "";
    const catalog = createHttpWorkspaceRepositoryCatalog({
      fetch: async (_input, init) => {
        body = String(init?.body);
        return jsonResponse(webDavDescriptor, 201);
      },
      validateContent,
    });
    const input = {
      adapter: "webdav" as const,
      authentication: {
        password: "secret",
        type: "basic" as const,
        username: "writer",
      },
      initialContent: createRepositoryContent(),
      label: "Remote",
      url: "https://dav.example.test/notes",
    };

    await expect(catalog.createRepository(input)).resolves.toEqual(
      webDavDescriptor,
    );
    expect(JSON.parse(body)).toEqual(input);
    expect(JSON.stringify(webDavDescriptor)).not.toContain("secret");
  });

  it("deletes through the mode query and atomically clears cached catalog/state", async () => {
    const cache = createMemoryRepositoryClientCache();
    const atomicDelete = vi.spyOn(cache, "deleteRepositoryAtomically");
    const calls: Array<{ method: string; url: string }> = [];
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test/base",
      cache,
      fetch: async (input, init) => {
        calls.push({ method: init?.method ?? "GET", url: String(input) });
        return jsonResponse({ status: "deleted" });
      },
      token: "token-a",
      validateContent,
    });

    await expect(catalog.deleteRepository({
      id: "primary",
      mode: "delete-managed-data",
    })).resolves.toEqual({ status: "deleted" });
    expect(calls).toEqual([{
      method: "DELETE",
      url: "http://api.test/base/api/repositories/primary?mode=delete-managed-data",
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
        creatableAdapters: ["local", "webdav"],
        issues: [],
        repositories: present ? [descriptor] : [],
      }),
      validateContent,
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
        content: createRepositoryContent(),
        revision: revisionA,
      },
    });
    present = false;
    await expect(catalog.listRepositories()).resolves.toEqual({
      creatableAdapters: ["local", "webdav"],
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
