import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
  RepositoryCatalogIssueDto,
  RepositoryDescriptorDto,
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/types";
import { LocalRepositoryCatalog } from "../../../../infrastructure/server/adapters/local/localRepositoryCatalog.ts";
import { CompositeRepositoryCatalog } from "../../../../infrastructure/server/catalog/compositeRepositoryCatalog.ts";
import { RepositoryCatalogError } from "../../../../infrastructure/server/repository/catalog.ts";
import type { WorkspaceRepositoryStore } from "../../../../infrastructure/server/repository/store.ts";

const revision = `sha256:${"a".repeat(64)}` as const;
const firstUuid = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
const secondUuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const remoteLocation = {
  type: "webdav" as const,
  url: "https://dav.example.test/notes/",
};

function createContent(name: string): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 4,
    syntax: { activeFileId: null, files: [] },
    workspace: { id: "workspace", name, notes: [], tree: [] },
  };
}

type RegistryPort = ConstructorParameters<typeof CompositeRepositoryCatalog>[1];

function createStore(content: WorkspaceRepositoryContentDto): WorkspaceRepositoryStore {
  return {
    async commitSnapshot() {
      return { revision };
    },
    async loadSnapshot() {
      return { content, revision };
    },
  };
}

function createRegistry({
  issues = [],
  repositories = [],
}: {
  issues?: RepositoryCatalogIssueDto[];
  repositories?: RepositoryDescriptorDto[];
} = {}) {
  const currentIssues = [...issues];
  const currentRepositories = [...repositories];
  const stores = new Map<string, WorkspaceRepositoryStore>();
  const register = vi.fn<RegistryPort["register"]>(async (input) => {
    const descriptor: RepositoryDescriptorDto = {
      adapter: "webdav",
      id: input.id,
      label: input.label,
      location: { type: "webdav", url: input.url },
      labelIssue: null,
    };

    currentRepositories.push(descriptor);
    stores.set(input.id, createStore(input.initialContent));
    return descriptor;
  });
  const removeConnection = vi.fn<RegistryPort["removeConnection"]>(async (id) => {
    const index = currentRepositories.findIndex((entry) => entry.id === id);

    if (index >= 0) {
      currentRepositories.splice(index, 1);
      stores.delete(id);
      return true;
    }
    const issueIndex = currentIssues.findIndex((entry) => entry.id === id);

    if (issueIndex >= 0) {
      currentIssues.splice(issueIndex, 1);
      return true;
    }
    return false;
  });
  const deleteManagedData = vi.fn<RegistryPort["deleteManagedData"]>(async () => ({
    status: "deleting" as const,
  }));
  const retryDeletion = vi.fn<RegistryPort["retryDeletion"]>(async () => ({
    status: "deleted" as const,
  }));
  const renameConnection = vi.fn<RegistryPort["renameConnection"]>(async (
    id,
    label,
  ) => {
    const index = currentRepositories.findIndex((entry) => entry.id === id);
    const current = currentRepositories[index];
    if (!current) {
      throw new RepositoryCatalogError("repository_not_found", `missing ${id}`);
    }
    const renamed = { ...current, label, labelIssue: null };
    currentRepositories[index] = renamed;
    return renamed;
  });
  const registry: RegistryPort = {
    deleteManagedData,
    async dispose() {},
    async getStore(id) {
      const store = stores.get(id);

      if (!store) {
        throw new RepositoryCatalogError("repository_not_found", `missing ${id}`);
      }
      return store;
    },
    hasEntry(id) {
      return currentRepositories.some((entry) => entry.id === id) ||
        currentIssues.some((entry) => entry.id === id);
    },
    async initialize() {},
    async listEntries() {
      return {
        issues: [...currentIssues],
        repositories: [...currentRepositories],
      };
    },
    register,
    renameConnection,
    removeConnection,
    retryDeletion,
  };

  repositories.forEach((descriptor) => {
    stores.set(descriptor.id, createStore(createContent("Remote")));
  });
  return {
    deleteManagedData,
    register,
    registry,
    renameConnection,
    removeConnection,
    retryDeletion,
  };
}

async function withCatalog(
  run: (
    catalog: CompositeRepositoryCatalog,
    rootDir: string,
    registry: ReturnType<typeof createRegistry>,
  ) => Promise<void>,
  options: {
    createId?: () => string;
    issues?: RepositoryCatalogIssueDto[];
    repositories?: RepositoryDescriptorDto[];
  } = {},
) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-composite-"));
  const local = new LocalRepositoryCatalog(rootDir);
  const registry = createRegistry(options);
  const catalog = new CompositeRepositoryCatalog(local, registry.registry, {
    createId: options.createId,
  });

  try {
    await run(catalog, rootDir, registry);
  } finally {
    await catalog.dispose().catch(() => undefined);
    await rm(rootDir, { force: true, recursive: true });
  }
}

describe("composite repository catalog", () => {
  it("merges Local and WebDAV entries and publishes both creation capabilities", async () => {
    await withCatalog(async (catalog) => {
      await catalog.initialize();
      const created = await catalog.createRepository({
        adapter: "local",
        content: createContent("Local workspace"),
        label: "Stable local label",
      });

      await expect(catalog.listRepositories()).resolves.toEqual({
        creatableAdapters: ["local", "webdav"],
        issues: [],
        repositories: [
          created,
          {
            adapter: "webdav",
            id: "repository-remote",
            label: "Remote",
            location: remoteLocation,
            labelIssue: null,
          },
        ].sort((left, right) => left.id.localeCompare(right.id)),
      });
      await expect(
        catalog.getStore("repository-remote").then((store) => store.loadSnapshot()),
      ).resolves.toEqual({ content: createContent("Remote"), revision });
    }, {
      createId: () => firstUuid,
      repositories: [{
        adapter: "webdav",
        id: "repository-remote",
        label: "Remote",
        location: remoteLocation,
        labelIssue: null,
      }],
    });
  });

  it("allocates lowercase repository UUIDs and routes WebDAV registration", async () => {
    await withCatalog(async (catalog, _rootDir, registry) => {
      const content = createContent("Initial WebDAV content");
      const descriptor = await catalog.createRepository({
        adapter: "webdav",
        authentication: { type: "none" },
        initialContent: content,
        label: "NAS",
        url: "https://dav.example.test/notes/",
      });

      expect(descriptor).toEqual({
        adapter: "webdav",
        id: `repository-${firstUuid.toLowerCase()}`,
        label: "NAS",
        location: remoteLocation,
        labelIssue: null,
      });
      expect(registry.register).toHaveBeenCalledWith({
        authentication: { type: "none" },
        id: `repository-${firstUuid.toLowerCase()}`,
        initialContent: content,
        label: "NAS",
        url: "https://dav.example.test/notes/",
      });
    }, { createId: () => firstUuid });
  });

  it("retries generated IDs that collide with healthy or faulty entries", async () => {
    const ids = [firstUuid, secondUuid];

    await withCatalog(async (catalog) => {
      const created = await catalog.createRepository({
        adapter: "local",
        content: createContent("Local"),
        label: "Local",
      });

      expect(created.id).toBe(`repository-${secondUuid}`);
    }, {
      createId: () => ids.shift() ?? secondUuid,
      issues: [{
        adapter: "webdav",
        code: "repository_corrupt",
        id: `repository-${firstUuid.toLowerCase()}`,
        location: null,
        message: "bad registry entry",
        status: "fault",
      }],
    });
  });

  it("never publishes an allocator result outside the lowercase UUID id format", async () => {
    const createId = vi.fn(() => "not-a-uuid");

    await withCatalog(async (catalog) => {
      await expect(catalog.createRepository({
        adapter: "local",
        content: createContent("Invalid allocator"),
        label: "Invalid allocator",
      })).rejects.toMatchObject({ code: "internal_error" });
      expect(createId).toHaveBeenCalledTimes(100);
      await expect(catalog.listRepositories()).resolves.toMatchObject({
        repositories: [],
      });
    }, { createId });
  });

  it("enforces normalized unique labels and protected system names", async () => {
    await withCatalog(async (catalog) => {
      await expect(catalog.createRepository({
        adapter: "local",
        content: createContent("Reserved"),
        label: "  日记  ",
      })).rejects.toMatchObject({ code: "invalid_request" });
      await expect(catalog.createRepository({
        adapter: "local",
        content: createContent("Duplicate"),
        label: "  rＥＭＯＴＥ  ",
      })).rejects.toMatchObject({ code: "invalid_request" });
    }, {
      createId: () => firstUuid,
      repositories: [{
        adapter: "webdav",
        id: "repository-remote",
        label: "Remote",
        location: remoteLocation,
        labelIssue: null,
      }],
    });
  });

  it("renames healthy repositories without allowing cross-adapter conflicts", async () => {
    await withCatalog(async (catalog, _rootDir, registry) => {
      const local = await catalog.createRepository({
        adapter: "local",
        content: createContent("Local workspace name"),
        label: "Local",
      });
      const before = await (await catalog.getStore(local.id)).loadSnapshot();

      await expect(catalog.renameRepository(local.id, { label: "  Renamed  " }))
        .resolves.toMatchObject({
          id: local.id,
          label: "Renamed",
          labelIssue: null,
        });
      await expect((await catalog.getStore(local.id)).loadSnapshot()).resolves.toEqual(before);
      await expect(catalog.renameRepository(local.id, { label: "ＲＥＭＯＴＥ" }))
        .rejects.toMatchObject({ code: "invalid_request" });
      await expect(catalog.renameRepository("repository-remote", { label: "NAS" }))
        .resolves.toMatchObject({ label: "NAS", labelIssue: null });
      expect(registry.renameConnection).toHaveBeenCalledWith(
        "repository-remote",
        "NAS",
      );
    }, {
      createId: () => firstUuid,
      repositories: [{
        adapter: "webdav",
        id: "repository-remote",
        label: "Remote",
        location: remoteLocation,
        labelIssue: null,
      }],
    });
  });

  it("keeps existing duplicate and reserved labels readable while flagging conflicts", async () => {
    await withCatalog(async (catalog) => {
      await expect(catalog.listRepositories()).resolves.toMatchObject({
        repositories: [
          { id: "repository-a", labelIssue: "conflict" },
          { id: "repository-b", labelIssue: "conflict" },
          { id: "repository-journal", labelIssue: "reserved" },
        ],
      });
    }, {
      repositories: [
        {
          adapter: "webdav",
          id: "repository-a",
          label: "Same",
          location: { type: "webdav", url: "https://dav.example.test/a/" },
          labelIssue: null,
        },
        {
          adapter: "webdav",
          id: "repository-b",
          label: "ＳＡＭＥ",
          location: { type: "webdav", url: "https://dav.example.test/b/" },
          labelIssue: null,
        },
        {
          adapter: "webdav",
          id: "repository-journal",
          label: "日记",
          location: { type: "webdav", url: "https://dav.example.test/journal/" },
          labelIssue: null,
        },
      ],
    });
  });

  it("rejects duplicate IDs discovered across catalog owners", async () => {
    await withCatalog(async (catalog, rootDir) => {
      await mkdir(path.join(rootDir, "repository-same"));

      await expect(catalog.initialize()).rejects.toBeInstanceOf(RepositoryCatalogError);
    }, {
      repositories: [{
        adapter: "webdav",
        id: "repository-same",
        label: "Remote",
        location: remoteLocation,
        labelIssue: null,
      }],
    });
  });

  it("routes adapter-specific deletion and keeps missing IDs idempotent", async () => {
    await withCatalog(async (catalog, _rootDir, registry) => {
      const local = await catalog.createRepository({
        adapter: "local",
        content: createContent("Local"),
        label: "Local",
      });

      await expect(catalog.deleteRepository(local.id, "delete-managed-data"))
        .resolves.toEqual({ status: "deleted" });
      await expect(catalog.deleteRepository(local.id, "delete-managed-data"))
        .resolves.toEqual({ status: "deleted" });
      await expect(
        catalog.deleteRepository("repository-remote", "remove-connection"),
      ).resolves.toEqual({ status: "deleted" });
      expect(registry.removeConnection).toHaveBeenCalledWith("repository-remote");
    }, {
      createId: () => firstUuid,
      repositories: [{
        adapter: "webdav",
        id: "repository-remote",
        label: "Remote",
        location: remoteLocation,
        labelIssue: null,
      }],
    });
  });

  it("returns deleting for managed WebDAV cleanup and retries deleting issues", async () => {
    await withCatalog(async (catalog, _rootDir, registry) => {
      await expect(
        catalog.deleteRepository("repository-remote", "delete-managed-data"),
      ).resolves.toEqual({ status: "deleting" });
      expect(registry.deleteManagedData).toHaveBeenCalledWith("repository-remote");
    }, {
      repositories: [{
        adapter: "webdav",
        id: "repository-remote",
        label: "Remote",
        location: remoteLocation,
        labelIssue: null,
      }],
    });

    await withCatalog(async (catalog, _rootDir, registry) => {
      await expect(
        catalog.deleteRepository("repository-deleting", "delete-managed-data"),
      ).resolves.toEqual({ status: "deleted" });
      expect(registry.retryDeletion).toHaveBeenCalledWith("repository-deleting");
    }, {
      issues: [{
        adapter: "webdav",
        code: "repository_busy",
        id: "repository-deleting",
        location: remoteLocation,
        message: "deleting",
        status: "deleting",
      }],
    });
  });

  it("rejects deletion modes that do not match the adapter or fault state", async () => {
    await withCatalog(async (catalog) => {
      const local = await catalog.createRepository({
        adapter: "local",
        content: createContent("Local"),
        label: "Local",
      });

      await expect(catalog.deleteRepository(local.id, "remove-connection"))
        .rejects.toMatchObject({ code: "invalid_request" });
      await expect(
        catalog.deleteRepository("repository-fault", "delete-managed-data"),
      ).rejects.toMatchObject({ code: "invalid_request" });
    }, {
      createId: () => firstUuid,
      issues: [{
        adapter: "webdav",
        code: "repository_corrupt",
        id: "repository-fault",
        location: null,
        message: "bad config",
        status: "fault",
      }],
    });
  });
});
