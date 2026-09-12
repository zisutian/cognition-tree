// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { WorkspaceRepositoryContentDto } from
  "../../../../contracts/workspace/types.ts";
import { LocalRepositoryCatalog } from
  "../../../../infrastructure/server/repository/workspace/local/localRepositoryCatalog.ts";

const firstUuid = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
const secondUuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createContent(name: string): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 4,
    syntax: { activeFileId: null, files: [] },
    workspace: { id: "workspace", name, notes: [], tree: [] },
  };
}

async function withLocalAuthority(
  createIds: string[],
  run: (catalog: LocalRepositoryCatalog) => Promise<void>,
) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-local-authority-"));
  const catalog = new LocalRepositoryCatalog(rootDir, {
    createId: () => createIds.shift() ?? secondUuid,
  });

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
          content: firstContent,
          label: "First",
        });
        const second = await catalog.createRepository({
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
        content: createContent("Workspace"),
        label: "Original",
      });
      const beforeRename = await (await catalog.getStore(descriptor.id))
        .loadSnapshot();

      await expect(catalog.createRepository({
        content: createContent("Duplicate"),
        label: "ＯＲＩＧＩＮＡＬ",
      })).rejects.toMatchObject({ code: "invalid_request" });
      await expect(catalog.createRepository({
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
      await expect(catalog.deleteRepository(descriptor.id))
        .resolves.toBeUndefined();
      await expect(catalog.deleteRepository(descriptor.id))
        .resolves.toBeUndefined();
    });
  });

  it("closes catalog admission permanently when disposal begins", async () => {
    await withLocalAuthority([firstUuid], async (catalog) => {
      const disposal = catalog.dispose();

      await expect(catalog.listRepositories()).rejects.toMatchObject({
        code: "adapter_unavailable",
      });
      expect(() => catalog.initialize()).toThrow(expect.objectContaining({
        code: "adapter_unavailable",
      }));
      await expect(disposal).resolves.toBeUndefined();
      await expect(catalog.dispose()).resolves.toBeUndefined();
    });
  });
});
