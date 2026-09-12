// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { createRepositoryCatalogController } from "../../../../application/repository/index.ts";
import type { WorkspaceRepositoryPreparation } from "../../../../application/workspace/persistence/workspaceRepositoryPreparation";
import { createHttpRepositoryCacheIdentity } from "../../../../infrastructure/client/http/httpRepositoryIdentity";
import { createMemoryRepositoryClientCache } from "../../../../infrastructure/client/repository/repositoryClientCache";
import { createHttpWorkspaceRepositoryCatalog } from "../../../../infrastructure/client/runtime/index.ts";
import {
  createWorkspaceRepositoryContent,
  revisionA,
  revisionC,
} from "../../../support/workspaceRepositoryFixtures";

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

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
const basis = { baseRevision: revisionA, operationId: "catalog-operation" };
const serverCatalog = {
  revision: revisionA,
  issues: [issue],
  repositories: [descriptor],
};

function receipt(repository?: typeof descriptor) {
  return {
    afterRevision: revisionC,
    audit: "recorded",
    baseRevision: revisionA,
    changeMetadata: { blockIds: [], resourceIds: [descriptor.id] },
    command: "catalog",
    digest: revisionA,
    error: null,
    occurredAt: "2026-09-10T00:00:00.000Z",
    operationId: basis.operationId,
    preparation: null,
    review: null,
    scope: { domain: "catalog" },
    status: "committed",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...(repository ? { repository } : {}),
  };
}

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
      revision: revisionA,
      issues: [issue],
      repositories: [descriptor],
    });
  });

  it("creates v4 content with an explicit stable catalog label", async () => {
    const calls: Array<{
      body?: BodyInit | null;
      method: string;
      url: string;
    }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        method: init?.method ?? "GET",
        url: String(input),
      });
      return jsonResponse(receipt(descriptor));
    };
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test/base",
      fetch: fetchMock,
      preparation,
    });
    const input = {
      ...basis,
      label: "Stable label",
    };

    await expect(catalog.createRepository(input)).resolves.toEqual({
      descriptor,
      revision: revisionC,
    });
    expect(calls).toEqual([
      {
        body: JSON.stringify({
          scope: { domain: "catalog" },
          basis: { baseRevision: revisionA, repositoryId: null },
          operationId: basis.operationId,
          command: { kind: "create-repository", name: input.label },
        }),
        method: "POST",
        url: "http://api.test/base/api/v4/content/operations",
      },
    ]);
  });

  it("renames catalog metadata through content operations and refreshes the cache", async () => {
    const cache = createMemoryRepositoryClientCache();
    const calls: Array<{
      body?: BodyInit | null;
      method: string;
      url: string;
    }> = [];
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
        return init?.method === "POST"
          ? jsonResponse(receipt(renamed))
          : jsonResponse(serverCatalog);
      },
      preparation,
    });

    await catalog.listRepositories();
    await expect(
      catalog.renameRepository({
        ...basis,
        repository: descriptor.label,
        id: descriptor.id,
        label: "  Renamed  ",
      }),
    ).resolves.toEqual({ descriptor: renamed, revision: revisionC });
    const catalogIdentity = await createHttpRepositoryCacheIdentity({
      baseUrl: "http://api.test/base",
      repositoryId: "__catalog__",
    });

    await expect(cache.catalogs.load(catalogIdentity)).resolves.toMatchObject({
      repositories: [renamed],
    });
    expect(calls[1]).toEqual({
      body: JSON.stringify({
        scope: { domain: "catalog" },
        basis: { baseRevision: revisionA, repositoryId: null },
        operationId: basis.operationId,
        command: {
          kind: "rename-repository",
          repository: descriptor.label,
          name: "Renamed",
        },
      }),
      method: "POST",
      url: "http://api.test/base/api/v4/content/operations",
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
      ...basis,
      label: "Invalid/name",
    };

    await expect(catalog.createRepository(input)).rejects.toThrow(
      "unsupported characters",
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
      "http://api.test/api/v4/sync/workspaces/primary",
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
        preparation,
      });

    await expect(createCatalog().listRepositories()).resolves.toEqual({
      revision: revisionA,
      issues: [issue],
      repositories: [descriptor],
    });
    unavailable = true;
    await expect(createCatalog().listRepositories()).resolves.toEqual({
      revision: null,
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
          : jsonResponse({
              revision: revisionA,
              issues: [],
              repositories: [descriptor],
            }),
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
        return jsonResponse(receipt());
      },
      preparation,
    });

    await expect(
      catalog.deleteRepository({
        ...basis,
        repository: descriptor.label,
        id: "primary",
      }),
    ).resolves.toEqual({ revision: revisionC });
    expect(calls).toEqual([
      {
        method: "POST",
        url: "http://api.test/base/api/v4/content/operations",
      },
    ]);
    expect(atomicDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryId: "primary",
      }),
    );
  });

  it("reconciles removed remote entries without retaining a ghost descriptor", async () => {
    const cache = createMemoryRepositoryClientCache();
    let present = true;
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test",
      cache,
      fetch: async () =>
        jsonResponse({
          revision: revisionA,
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
      revision: revisionA,
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

  it("does not let an older list response replace a newer cache projection", async () => {
    const cache = createMemoryRepositoryClientCache();
    const firstResponse = deferred<Response>();
    const secondResponse = deferred<Response>();
    const renamed = { ...descriptor, label: "Newest" };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test",
      cache,
      fetch: fetchMock,
      preparation,
    });
    const first = catalog.listRepositories();
    const second = catalog.listRepositories();

    secondResponse.resolve(
      jsonResponse({
        revision: revisionC,
        issues: [],
        repositories: [renamed],
      }),
    );
    await expect(second).resolves.toMatchObject({ repositories: [renamed] });
    firstResponse.resolve(jsonResponse(serverCatalog));
    await expect(first).resolves.toEqual(serverCatalog);
    const catalogIdentity = await createHttpRepositoryCacheIdentity({
      baseUrl: "http://api.test",
      repositoryId: "__catalog__",
    });

    await expect(cache.catalogs.load(catalogIdentity)).resolves.toMatchObject({
      repositories: [renamed],
    });
  });

  it("does not hide a completed remote deletion behind cache cleanup failure", async () => {
    const cache = createMemoryRepositoryClientCache();

    cache.deleteRepositoryAtomically = vi.fn(async () => {
      throw new Error("cache unavailable");
    });
    const catalog = createHttpWorkspaceRepositoryCatalog({
      baseUrl: "http://api.test",
      cache,
      fetch: async () => jsonResponse(receipt()),
      preparation,
    });

    await expect(
      catalog.deleteRepository({
        ...basis,
        repository: descriptor.label,
        id: descriptor.id,
      }),
    ).resolves.toEqual({ revision: revisionC });
  });

  it.each(
    ["create", "rename", "delete"].flatMap((operation) =>
      [revisionC, null].map((afterRevision) => ({ operation, afterRevision })),
    ),
  )(
    "keeps confirmed $operation visible through cache failure and disconnect (revision $afterRevision)",
    async ({ operation, afterRevision }) => {
      const cache = createMemoryRepositoryClientCache();
      let offline = false;
      const changed = {
        ...descriptor,
        id: operation === "create" ? "created" : descriptor.id,
        label: "New label",
      };
      const backend = createHttpWorkspaceRepositoryCatalog({
        baseUrl: "http://api.test",
        cache,
        preparation,
        fetch: async (_input, init) => {
          if (init?.method === "POST") {
            offline = true;
            return jsonResponse({
              ...receipt(operation === "delete" ? undefined : changed),
              afterRevision,
            });
          }
          if (offline) throw new TypeError("Service disconnected");
          return jsonResponse(serverCatalog);
        },
      });
      let active: string | null = descriptor.id;
      const controller = createRepositoryCatalogController({
        catalog: backend,
        activeRepositorySelection: {
          load: () => active,
          save: (id) => {
            active = id;
          },
          clear: () => {
            active = null;
          },
        },
        createOperationId: () => basis.operationId,
      });
      try {
        await controller.reload();
        cache.catalogs.save = vi.fn(async () => {
          throw new Error("Cache is unavailable");
        });
        cache.renameRepositoryAtomically = vi.fn(async () => {
          throw new Error("Cache is unavailable");
        });
        cache.deleteRepositoryAtomically = vi.fn(async () => {
          throw new Error("Cache is unavailable");
        });
        if (operation === "create")
          await controller.createRepository({ name: changed.label });
        else if (operation === "rename")
          await controller.renameRepository({
            id: descriptor.id,
            name: changed.label,
          });
        else await controller.deleteRepository({ id: descriptor.id });
        const expected =
          operation === "create"
            ? [changed, descriptor]
            : operation === "rename"
              ? [changed]
              : [];
        expect(controller.getSnapshot().state).toMatchObject({
          repositories: expected,
        });
        for (let attempt = 0; attempt < 2; attempt++) {
          await controller.reload();
          expect(controller.getSnapshot().state).toMatchObject({
            repositories: expected,
            revision: null,
          });
          expect(controller.getSnapshot().activeDescriptor?.id ?? null).toBe(
            operation === "delete" ? null : changed.id,
          );
        }
        await expect(
          controller.createRepository({
            name: "Blocked without a fresh revision",
          }),
        ).rejects.toThrow("请刷新仓库目录");
        // A fresh remote snapshot can still replace the retained display.
        offline = false;
        await controller.reload();
        expect(controller.getSnapshot().state).toMatchObject(serverCatalog);
      } finally {
        controller.dispose();
      }
    },
  );
});
