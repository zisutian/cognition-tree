import { describe, expect, it, vi } from "vitest";
import type { RepositoryCatalogDto } from "../../../../contracts/workspace-repository/types";
import type { BrowserRepositoryClientCache } from "../../../../src/storage/adapters/browser/browserRepositoryClientCache";
import { createBrowserWorkspaceRepositoryCatalog } from "../../../../src/storage/adapters/browser/browserWorkspaceRepository";
import { createMemoryRepositoryClientCache } from "../../../../src/storage/repository/repositoryClientCache";
import { WorkspaceRepositoryLocalConflictError } from "../../../../src/storage/repository/workspaceRepository";
import { createRepositoryContent } from "../../repositoryV3Fixtures";

const uuidA = "00000000-0000-4000-8000-000000000001";
const uuidB = "00000000-0000-4000-8000-000000000002";
const repositoryIdA = `repository-${uuidA}`;
const databaseName = "cognition-tree.repository-cache";

function createCatalog(
  cache: BrowserRepositoryClientCache,
  uuids = [uuidA],
) {
  let index = 0;

  return createBrowserWorkspaceRepositoryCatalog({
    cache,
    createRepositoryUuid: () => uuids[index++] ?? uuids.at(-1)!,
    validateContent: () => undefined,
  });
}

function createMemoryBrowserCache(): BrowserRepositoryClientCache {
  const cache = createMemoryRepositoryClientCache();

  return {
    ...cache,
    async createRepositoryAtomically({
      catalogIdentity,
      content,
      descriptor,
      localRevision,
      remoteRevision,
      repositoryIdentity,
    }) {
      const existing = await cache.catalogs.load(catalogIdentity);

      if (
        existing?.repositories.some(({ id }) => id === descriptor.id) ||
        existing?.issues.some(({ id }) => id === descriptor.id)
      ) {
        throw new Error(`Browser repository already exists: ${descriptor.id}`);
      }

      await cache.snapshots.create({
        identity: repositoryIdentity,
        localRevision,
        snapshot: { content, revision: remoteRevision },
      });
      try {
        await cache.catalogs.save(catalogIdentity, {
          creatableAdapters: ["browser"],
          issues: existing?.issues ?? [],
          repositories: [
            ...(existing?.repositories ?? []),
            descriptor,
          ].sort((left, right) => left.id.localeCompare(right.id)),
          version: 4,
        });
      } catch (error) {
        await cache.snapshots.remove(repositoryIdentity);
        throw error;
      }
    },
  };
}

describe("browser workspace repository catalog", () => {
  it("creates repository state and v4 catalog metadata through one atomic port", async () => {
    const cache = createMemoryBrowserCache();
    const atomicCreate = vi.spyOn(cache, "createRepositoryAtomically");
    const catalog = createCatalog(cache);
    const content = createRepositoryContent("Browser workspace");
    const descriptor = await catalog.createRepository({
      adapter: "browser",
      content,
      label: "Stable label",
    });

    expect(descriptor).toEqual({
      adapter: "browser",
      id: repositoryIdA,
      label: "Stable label",
      location: { databaseName, type: "browser" },
      nameConflict: false,
    });
    await expect(catalog.listRepositories()).resolves.toEqual({
      creatableAdapters: ["browser"],
      issues: [],
      repositories: [descriptor],
    });
    expect(atomicCreate).toHaveBeenCalledTimes(1);
    expect(atomicCreate).toHaveBeenCalledWith(
      expect.objectContaining({ content, descriptor }),
    );

    await expect(catalog.openRepository(descriptor).loadSnapshot()).resolves
      .toMatchObject({
        content,
        pendingChanges: false,
      });
  });

  it("lets only one tab stage a shared local draft revision", async () => {
    const cache = createMemoryBrowserCache();
    const catalog = createCatalog(cache);
    const descriptor = await catalog.createRepository({
      adapter: "browser",
      content: createRepositoryContent("Initial"),
      label: "Shared",
    });
    const firstTab = catalog.openRepository(descriptor);
    const secondTab = catalog.openRepository(descriptor);
    const firstSnapshot = await firstTab.loadSnapshot();
    const secondSnapshot = await secondTab.loadSnapshot();

    await firstTab.stageSnapshot({
      content: createRepositoryContent("First tab wins"),
      expectedLocalRevision: firstSnapshot.localRevision,
    });

    await expect(
      secondTab.stageSnapshot({
        content: createRepositoryContent("Second tab is stale"),
        expectedLocalRevision: secondSnapshot.localRevision,
      }),
    ).rejects.toBeInstanceOf(WorkspaceRepositoryLocalConflictError);
    await expect(secondTab.loadSnapshot()).resolves.toMatchObject({
      content: { workspace: { name: "First tab wins" } },
    });
  });

  it("persists only the latest v3 content and computes a sha256 saved revision", async () => {
    const cache = createMemoryBrowserCache();
    const catalog = createCatalog(cache);
    const descriptor = await catalog.createRepository({
      adapter: "browser",
      content: createRepositoryContent("Initial"),
      label: "Primary",
    });
    const repository = catalog.openRepository(descriptor);
    const initial = await repository.loadSnapshot();
    const content = createRepositoryContent("Updated", "Changed note source");
    const staged = await repository.stageSnapshot({
      content,
      expectedLocalRevision: initial.localRevision,
    });

    expect(staged.localRevision).toMatch(/^draft:/);
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content,
      localRevision: staged.localRevision,
      pendingChanges: false,
      remoteRevision: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
    await expect(repository.synchronizePendingSnapshot()).resolves.toMatchObject({
      pendingChanges: false,
      status: "synced",
    });
  });

  it("allocates ids inside the catalog and retries health/issue collisions", async () => {
    const cache = createMemoryBrowserCache();
    await cache.catalogs.save("browser:v4", {
      creatableAdapters: ["browser"],
      issues: [{
        adapter: "browser",
        code: "repository_corrupt",
        id: repositoryIdA,
        location: { databaseName, type: "browser" },
        message: "broken",
        status: "fault",
      }],
      repositories: [],
      version: 4,
    });
    const catalog = createCatalog(cache, [uuidA, uuidB]);
    const descriptor = await catalog.createRepository({
      adapter: "browser",
      content: createRepositoryContent("A"),
      label: "A",
    });

    expect(descriptor.id).toBe(`repository-${uuidB}`);

    const catalogState: RepositoryCatalogDto = {
      creatableAdapters: ["browser"],
      issues: [{
        adapter: "browser",
        code: "repository_corrupt",
        id: repositoryIdA,
        location: { databaseName, type: "browser" },
        message: "broken",
        status: "fault",
      }],
      repositories: [descriptor],
    };
    await expect(catalog.listRepositories()).resolves.toEqual(catalogState);
  });

  it("stops auto-id collision retries after the fixed attempt limit", async () => {
    const cache = createMemoryBrowserCache();
    await cache.catalogs.save("browser:v4", {
      creatableAdapters: ["browser"],
      issues: [],
      repositories: [{
        adapter: "browser",
        id: repositoryIdA,
        label: "Existing",
        location: { databaseName, type: "browser" },
        nameConflict: false,
      }],
      version: 4,
    });
    const createRepositoryUuid = vi.fn(() => uuidA);
    const catalog = createBrowserWorkspaceRepositoryCatalog({
      cache,
      createRepositoryUuid,
      validateContent: () => undefined,
    });

    await expect(catalog.createRepository({
      adapter: "browser",
      content: createRepositoryContent(),
      label: "Never created",
    })).rejects.toThrow("Unable to allocate");
    expect(createRepositoryUuid).toHaveBeenCalledTimes(100);
  });

  it("does not publish partial catalog state when atomic creation fails", async () => {
    const cache = createMemoryBrowserCache();
    cache.createRepositoryAtomically = vi.fn(async () => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const catalog = createCatalog(cache);

    await expect(
      catalog.createRepository({
        adapter: "browser",
        content: createRepositoryContent(),
        label: "Primary",
      }),
    ).rejects.toThrow("quota exceeded");
    await expect(catalog.listRepositories()).resolves.toEqual({
      creatableAdapters: ["browser"],
      issues: [],
      repositories: [],
    });
  });

  it("rejects invalid exact create content before the atomic cache port", async () => {
    const cache = createMemoryBrowserCache();
    const atomicCreate = vi.spyOn(cache, "createRepositoryAtomically");
    const catalog = createCatalog(cache);
    const content = createRepositoryContent();

    Object.assign(content.workspace.notes[0]!, {
      title: "derived field must not persist",
    });
    await expect(catalog.createRepository({
      adapter: "browser",
      content,
      label: "Invalid",
    })).rejects.toThrow("unsupported field");
    expect(atomicCreate).not.toHaveBeenCalled();
    await expect(catalog.listRepositories()).resolves.toEqual({
      creatableAdapters: ["browser"],
      issues: [],
      repositories: [],
    });
  });

  it("rejects unsafe note ids before stage and preserves the prior draft", async () => {
    const cache = createMemoryBrowserCache();
    const catalog = createCatalog(cache);
    const descriptor = await catalog.createRepository({
      adapter: "browser",
      content: createRepositoryContent("Initial"),
      label: "Primary",
    });
    const repository = catalog.openRepository(descriptor);
    const before = await repository.loadSnapshot();
    const unsafeContent = createRepositoryContent("Unsafe");

    unsafeContent.workspace.notes = [{ id: "../escape", source: "unsafe" }];
    unsafeContent.workspace.tree = [{ kind: "note", noteId: "../escape" }];
    await expect(repository.stageSnapshot({
      content: unsafeContent,
      expectedLocalRevision: before.localRevision,
    })).rejects.toThrow("invalid repository note id");
    await expect(repository.loadSnapshot()).resolves.toEqual(before);
  });

  it("renames only the catalog label and enforces normalized global names", async () => {
    const cache = createMemoryBrowserCache();
    const catalog = createCatalog(cache, [uuidA, uuidB]);
    const first = await catalog.createRepository({
      adapter: "browser",
      content: createRepositoryContent("Content stays independent"),
      label: "Primary",
    });
    const second = await catalog.createRepository({
      adapter: "browser",
      content: createRepositoryContent("Second"),
      label: "Second",
    });
    const before = await catalog.openRepository(first).loadSnapshot();

    await expect(catalog.renameRepository({
      id: first.id,
      label: "  Renamed  ",
    })).resolves.toMatchObject({ label: "Renamed", nameConflict: false });
    await expect(catalog.renameRepository({
      id: first.id,
      label: "ＳＥＣＯＮＤ",
    })).rejects.toThrow("already exists");
    await expect(catalog.renameRepository({
      id: first.id,
      label: "日记",
    })).rejects.toThrow("reserved");
    await expect(catalog.listRepositories()).resolves.toMatchObject({
      repositories: [
        { id: first.id, label: "Renamed", nameConflict: false },
        { id: second.id, label: "Second", nameConflict: false },
      ],
    });
    await expect(catalog.openRepository({ ...first, label: "Renamed" })
      .loadSnapshot()).resolves.toMatchObject({ content: before.content });
  });

  it("deletes browser content and catalog metadata idempotently", async () => {
    const cache = createMemoryBrowserCache();
    const atomicDelete = vi.spyOn(cache, "deleteRepositoryAtomically");
    const catalog = createCatalog(cache);
    const descriptor = await catalog.createRepository({
      adapter: "browser",
      content: createRepositoryContent(),
      label: "Primary",
    });

    await expect(catalog.deleteRepository({
      id: descriptor.id,
      mode: "delete-managed-data",
    })).resolves.toEqual({ status: "deleted" });
    await expect(catalog.deleteRepository({
      id: descriptor.id,
      mode: "delete-managed-data",
    })).resolves.toEqual({ status: "deleted" });
    expect(atomicDelete).toHaveBeenCalledTimes(2);
    await expect(catalog.listRepositories()).resolves.toEqual({
      creatableAdapters: ["browser"],
      issues: [],
      repositories: [],
    });
    await expect(catalog.openRepository(descriptor).loadSnapshot())
      .rejects.toThrow("does not exist");
    await expect(catalog.deleteRepository({
      id: descriptor.id,
      mode: "remove-connection",
    })).rejects.toThrow("only support managed-data deletion");
  });
});
