import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { WorkspaceRepositoryContentDto } from "../../../contracts/workspace-repository/types";
import { LocalRepositoryCatalog } from "../../../server/adapters/local/localRepositoryCatalog.ts";
import { CompositeRepositoryCatalog } from "../../../server/catalog/compositeRepositoryCatalog.ts";
import { RepositoryCatalogError } from "../../../server/repository/repositoryCatalog.ts";

const revision = `sha256:${"a".repeat(64)}` as const;

function createContent(name: string): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 3,
    syntaxSource: null,
    workspace: { id: "workspace", name, notes: [], tree: [] },
  };
}

async function withCatalog(
  remoteId: string,
  testFn: (catalog: CompositeRepositoryCatalog, rootDir: string) => Promise<void>,
) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-composite-"));
  const local = new LocalRepositoryCatalog(rootDir);
  const remoteContent = createContent("Remote");
  const catalog = new CompositeRepositoryCatalog(local, [{
    descriptor: {
      adapter: "webdav",
      id: remoteId,
      label: "Remote",
      locationLabel: `webdav:${remoteId}`,
    },
    store: {
      async commitSnapshot() {
        return { revision };
      },
      async loadSnapshot() {
        return { content: remoteContent, revision };
      },
    },
  }]);

  try {
    await testFn(catalog, rootDir);
  } finally {
    await local.dispose();
    await rm(rootDir, { force: true, recursive: true });
  }
}

describe("composite repository catalog", () => {
  it("merges healthy adapters and local catalog issues", async () => {
    await withCatalog("remote", async (catalog) => {
      await catalog.initialize();
      await catalog.createRepository({
        content: createContent("Local workspace"),
        id: "local",
        label: "Stable local label",
      });

      await expect(catalog.listRepositories()).resolves.toEqual({
        issues: [],
        repositories: [
          {
            adapter: "local",
            id: "local",
            label: "Stable local label",
            locationLabel: "local:local",
          },
          {
            adapter: "webdav",
            id: "remote",
            label: "Remote",
            locationLabel: "webdav:remote",
          },
        ],
      });
      await expect(catalog.getStore("remote").then((store) => store.loadSnapshot()))
        .resolves.toEqual({ content: createContent("Remote"), revision });
    });
  });

  it("rejects configured id collisions", async () => {
    await withCatalog("same", async (catalog) => {
      await catalog.initialize();
      await expect(catalog.createRepository({
        content: createContent("Local"),
        id: "same",
        label: "Same",
      })).rejects.toBeInstanceOf(RepositoryCatalogError);
    });
  });

  it("rejects a configured id collision with an unhealthy local repository", async () => {
    await withCatalog("same", async (catalog, rootDir) => {
      await mkdir(path.join(rootDir, "same"));
      await expect(catalog.initialize()).rejects.toBeInstanceOf(RepositoryCatalogError);
    });
  });
});
