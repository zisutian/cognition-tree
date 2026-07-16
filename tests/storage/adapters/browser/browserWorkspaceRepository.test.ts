import { describe, expect, it, vi } from "vitest";
import type { RepositoryCatalogDto } from "../../../../contracts/workspace-repository/types";
import type { BrowserRepositoryClientCache } from "../../../../src/storage/adapters/browser/browserRepositoryClientCache";
import { createBrowserWorkspaceRepositoryCatalog } from "../../../../src/storage/adapters/browser/browserWorkspaceRepository";
import { createMemoryRepositoryClientCache } from "../../../../src/storage/repository/repositoryClientCache";
import { WorkspaceRepositoryLocalConflictError } from "../../../../src/storage/repository/workspaceRepository";
import { createRepositoryContent } from "../../repositoryV3Fixtures";

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

      if (existing?.repositories.some(({ id }) => id === descriptor.id)) {
        throw new Error(`Browser repository already exists: ${descriptor.id}`);
      }

      await cache.snapshots.create({
        identity: repositoryIdentity,
        localRevision,
        snapshot: { content, revision: remoteRevision },
      });
      try {
        await cache.catalogs.save(catalogIdentity, {
          issues: existing?.issues ?? [],
          repositories: [
            ...(existing?.repositories ?? []),
            descriptor,
          ].sort((left, right) => left.id.localeCompare(right.id)),
          version: 3,
        });
      } catch (error) {
        await cache.snapshots.remove(repositoryIdentity);
        throw error;
      }
    },
  };
}

describe("browser workspace repository catalog", () => {
  const validateContent = () => undefined;

  it("creates v3 repository state and catalog metadata through one atomic port", async () => {
    const cache = createMemoryBrowserCache();
    const atomicCreate = vi.spyOn(cache, "createRepositoryAtomically");
    const catalog = createBrowserWorkspaceRepositoryCatalog({ cache, validateContent });
    const content = createRepositoryContent("Browser workspace");
    const descriptor = await catalog.createRepository({
      content,
      id: "primary",
      label: "Stable label",
    });

    expect(descriptor).toEqual({
      adapter: "browser",
      id: "primary",
      label: "Stable label",
      locationLabel: "浏览器 · primary",
    });
    await expect(catalog.listRepositories()).resolves.toEqual({
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
    const catalog = createBrowserWorkspaceRepositoryCatalog({ cache, validateContent });
    const descriptor = await catalog.createRepository({
      content: createRepositoryContent("Initial"),
      id: "shared",
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
    const catalog = createBrowserWorkspaceRepositoryCatalog({ cache, validateContent });
    const descriptor = await catalog.createRepository({
      content: createRepositoryContent("Initial"),
      id: "primary",
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

  it("rejects duplicates and invalid ids without changing the catalog", async () => {
    const cache = createMemoryBrowserCache();
    const catalog = createBrowserWorkspaceRepositoryCatalog({ cache, validateContent });
    await catalog.createRepository({
      content: createRepositoryContent("A"),
      id: "same",
      label: "A",
    });

    await expect(
      catalog.createRepository({
        content: createRepositoryContent("B"),
        id: "same",
        label: "B",
      }),
    ).rejects.toThrow("already exists");
    await expect(
      catalog.createRepository({
        content: createRepositoryContent("Invalid"),
        id: "../invalid",
        label: "Invalid",
      }),
    ).rejects.toThrow("Invalid browser repository id");

    const catalogState: RepositoryCatalogDto = {
      issues: [],
      repositories: [
        {
          adapter: "browser",
          id: "same",
          label: "A",
          locationLabel: "浏览器 · same",
        },
      ],
    };
    await expect(catalog.listRepositories()).resolves.toEqual(catalogState);
  });

  it("does not publish partial catalog state when atomic creation fails", async () => {
    const cache = createMemoryBrowserCache();
    cache.createRepositoryAtomically = vi.fn(async () => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const catalog = createBrowserWorkspaceRepositoryCatalog({ cache, validateContent });

    await expect(
      catalog.createRepository({
        content: createRepositoryContent(),
        id: "primary",
        label: "Primary",
      }),
    ).rejects.toThrow("quota exceeded");
    await expect(catalog.listRepositories()).resolves.toEqual({
      issues: [],
      repositories: [],
    });
  });

  it("rejects invalid exact create content before the atomic cache port", async () => {
    const cache = createMemoryBrowserCache();
    const atomicCreate = vi.spyOn(cache, "createRepositoryAtomically");
    const catalog = createBrowserWorkspaceRepositoryCatalog({ cache, validateContent });
    const content = createRepositoryContent();

    Object.assign(content.workspace.notes[0]!, {
      title: "derived field must not persist",
    });
    await expect(catalog.createRepository({
      content,
      id: "invalid",
      label: "Invalid",
    })).rejects.toThrow("unsupported field");
    expect(atomicCreate).not.toHaveBeenCalled();
    await expect(catalog.listRepositories()).resolves.toEqual({
      issues: [],
      repositories: [],
    });
  });

  it("rejects unsafe note ids before stage and preserves the prior draft", async () => {
    const cache = createMemoryBrowserCache();
    const catalog = createBrowserWorkspaceRepositoryCatalog({ cache, validateContent });
    const descriptor = await catalog.createRepository({
      content: createRepositoryContent("Initial"),
      id: "primary",
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
});
