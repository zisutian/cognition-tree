import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CompositeRepositoryCatalog } from "../../../server/catalog/compositeRepositoryCatalog.ts";
import { LocalRepositoryCatalog } from "../../../server/adapters/local/localRepositoryCatalog.ts";
import { RepositoryCatalogError } from "../../../server/repository/repositoryCatalog.ts";
import { createInitialWorkspaceData } from "../../../src/workspace/model/workspaceData";

async function withCatalog(
  remoteId: string,
  testFn: (catalog: CompositeRepositoryCatalog) => Promise<void>,
) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-composite-"));

  try {
    const remoteStore = {
      async commitSnapshot() {
        return { revision: "remote" };
      },
      async loadSnapshot() {
        return {
          repositoryPath: "https://dav.test/remote/",
          revision: "remote",
          syntaxSourceFile: null,
          workspace: createInitialWorkspaceData(),
        };
      },
    };
    const catalog = new CompositeRepositoryCatalog(
      new LocalRepositoryCatalog(rootDir),
      [
        {
          descriptor: {
            adapter: "webdav",
            id: remoteId,
            label: "Remote",
            repositoryPath: "https://dav.test/remote/",
          },
          store: remoteStore,
        },
      ],
    );

    await testFn(catalog);
  } finally {
    await rm(rootDir, { force: true, recursive: true });
  }
}

describe("composite repository catalog", () => {
  it("lists configured adapters and creates new repositories locally", async () => {
    await withCatalog("remote", async (catalog) => {
      await catalog.initialize();
      await catalog.createRepository({
        content: {
          syntaxSourceFile: null,
          workspace: { ...createInitialWorkspaceData(), name: "Local" },
        },
        id: "local",
      });

      await expect(catalog.listRepositories()).resolves.toMatchObject({
        repositories: [
          { adapter: "local", id: "local", label: "Local" },
          { adapter: "webdav", id: "remote", label: "Remote" },
        ],
      });
      await expect(catalog.getStore("remote").then((store) => store.loadSnapshot()))
        .resolves.toMatchObject({ revision: "remote" });
    });
  });

  it("rejects configured ids that collide with local ids", async () => {
    await withCatalog("same", async (catalog) => {
      await catalog.initialize();
      await expect(
        catalog.createRepository({
          content: {
            syntaxSourceFile: null,
            workspace: createInitialWorkspaceData(),
          },
          id: "same",
        }),
      ).rejects.toBeInstanceOf(RepositoryCatalogError);
    });
  });
});
