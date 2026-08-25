// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { WorkspaceRepositoryContentDto } from
  "../../../../contracts/workspace/types.ts";
import { LocalRepositoryCatalog } from
  "../../../../infrastructure/server/adapters/local/localRepositoryCatalog.ts";
import { CompositeRepositoryCatalog } from
  "../../../../infrastructure/server/catalog/compositeRepositoryCatalog.ts";

const firstUuid = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
const secondUuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createContent(name: string): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 4,
    syntax: { activeFileId: null, files: [] },
    workspace: { id: "workspace", name, notes: [], tree: [] },
  };
}

function createUnusedRemoteRegistry(): ConstructorParameters<
  typeof CompositeRepositoryCatalog
>[1] {
  return {
    async deleteManagedData() {
      throw new Error("WebDAV must not own local repository behavior");
    },
    async dispose() {},
    async getStore() {
      throw new Error("WebDAV must not own local repository behavior");
    },
    hasEntry() {
      return false;
    },
    async initialize() {},
    async listEntries() {
      return { issues: [], repositories: [] };
    },
    async register() {
      throw new Error("WebDAV must not own local repository behavior");
    },
    async removeConnection() {
      throw new Error("WebDAV must not own local repository behavior");
    },
    async renameConnection() {
      throw new Error("WebDAV must not own local repository behavior");
    },
    async retryDeletion() {
      throw new Error("WebDAV must not own local repository behavior");
    },
  };
}

async function withLocalAuthority(
  createIds: string[],
  run: (catalog: CompositeRepositoryCatalog) => Promise<void>,
) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-local-authority-"));
  const localCatalog = new LocalRepositoryCatalog(rootDir);
  const catalog = new CompositeRepositoryCatalog(
    localCatalog,
    createUnusedRemoteRegistry(),
    { createId: () => createIds.shift() ?? secondUuid },
  );

  try {
    await run(catalog);
  } finally {
    await catalog.dispose().catch(() => undefined);
    await rm(rootDir, { force: true, recursive: true });
  }
}

describe("local repository authority characterization", () => {
  it("allocates stable lowercase IDs, preserves content, and retries collisions", async () => {
    await withLocalAuthority(
      [firstUuid, firstUuid, secondUuid],
      async (catalog) => {
        const firstContent = createContent("First workspace");
        const first = await catalog.createRepository({
          adapter: "local",
          content: firstContent,
          label: "First",
        });
        const second = await catalog.createRepository({
          adapter: "local",
          content: createContent("Second workspace"),
          label: "Second",
        });

        expect(first.id).toBe(`repository-${firstUuid.toLowerCase()}`);
        expect(second.id).toBe(`repository-${secondUuid}`);
        await expect((await catalog.getStore(first.id)).loadSnapshot())
          .resolves.toMatchObject({ content: firstContent });
        await expect(catalog.listRepositories()).resolves.toMatchObject({
          issues: [],
          repositories: [
            { id: first.id, label: "First", labelIssue: null },
            { id: second.id, label: "Second", labelIssue: null },
          ],
        });
      },
    );
  });

  it("owns portable unique labels, renaming, and idempotent managed deletion", async () => {
    await withLocalAuthority([firstUuid], async (catalog) => {
      const descriptor = await catalog.createRepository({
        adapter: "local",
        content: createContent("Workspace"),
        label: "Original",
      });
      const beforeRename = await (await catalog.getStore(descriptor.id))
        .loadSnapshot();

      await expect(catalog.createRepository({
        adapter: "local",
        content: createContent("Duplicate"),
        label: "ＯＲＩＧＩＮＡＬ",
      })).rejects.toMatchObject({ code: "invalid_request" });
      await expect(catalog.createRepository({
        adapter: "local",
        content: createContent("Reserved"),
        label: " 日记 ",
      })).rejects.toMatchObject({ code: "invalid_request" });
      await expect(catalog.renameRepository(descriptor.id, {
        label: " Renamed ",
      })).resolves.toMatchObject({
        id: descriptor.id,
        label: "Renamed",
        labelIssue: null,
      });
      await expect((await catalog.getStore(descriptor.id)).loadSnapshot())
        .resolves.toEqual(beforeRename);
      await expect(catalog.deleteRepository(
        descriptor.id,
        "delete-managed-data",
      )).resolves.toEqual({ status: "deleted" });
      await expect(catalog.deleteRepository(
        descriptor.id,
        "delete-managed-data",
      )).resolves.toEqual({ status: "deleted" });
    });
  });
});
