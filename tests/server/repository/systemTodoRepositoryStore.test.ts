// SPDX-License-Identifier: GPL-3.0-or-later

import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SystemRepositoryCatalog } from "../../../server/repository/systemRepositoryCatalog.ts";
import { RepositoryCorruptError } from "../../../server/repository/repositoryStore.ts";
import {
  validateSystemRepositoryContent,
  validateSystemRepositoryTransition,
} from "../../../server/repository/systemRepositoryStore.ts";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoTimestamp,
} from "../../todo/todoTestFixture.ts";

async function withStateDirectory(
  run: (stateDirectory: string) => Promise<void>,
) {
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), "ctn-system-todo-store-"),
  );
  try {
    await chmod(stateDirectory, 0o700);
    await run(stateDirectory);
  } finally {
    await rm(stateDirectory, { force: true, recursive: true });
  }
}

function createCatalog(stateDirectory: string) {
  return new SystemRepositoryCatalog(stateDirectory, {
    validateContent: validateSystemRepositoryContent,
    validateTransition: validateSystemRepositoryTransition,
  });
}

function createTodoContent() {
  return appendTodoTestItem(
    appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
      createdAt: todoTimestamp(1),
    }),
    {
      collectionIndex: 1,
      createdAt: todoTimestamp(2),
      itemIndex: 1,
    },
  );
}

describe("filesystem Todo system repository", () => {
  it("rejects invalid Todo transitions without overwriting bytes", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const catalog = createCatalog(stateDirectory);

      await catalog.initialize();
      const store = await catalog.getStore("system-todo");
      const initial = await store.loadSnapshot();
      const valid = createTodoContent();
      const committed = await store.commitSnapshot({
        baseRevision: initial.revision,
        content: valid,
      });
      const filePath = path.join(
        stateDirectory,
        "system-repositories",
        "system-todo.json",
      );
      const before = await readFile(filePath, "utf8");
      const tampered = {
        ...valid,
        collections: [{
          ...valid.collections[0]!,
          createdAt: todoTimestamp(0),
        }],
      };

      await expect(store.commitSnapshot({
        baseRevision: committed.revision,
        content: tampered,
      })).rejects.toThrow(/createdAt is immutable/);
      expect(await readFile(filePath, "utf8")).toBe(before);
      await expect(store.loadSnapshot()).resolves.toEqual({
        content: valid,
        revision: committed.revision,
      });
    });
  });

  it("retains semantically corrupt Todo bytes and reports corruption", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const catalog = createCatalog(stateDirectory);

      await catalog.initialize();
      const store = await catalog.getStore("system-todo");
      const filePath = path.join(
        stateDirectory,
        "system-repositories",
        "system-todo.json",
      );
      const valid = createTodoContent();
      const invalid = {
        ...valid,
        collections: [{ ...valid.collections[0]!, name: " 未裁剪 " }],
      };
      const invalidSource = `${JSON.stringify(invalid)}\n`;

      await writeFile(filePath, invalidSource, { mode: 0o600 });
      await expect(store.loadSnapshot()).rejects.toBeInstanceOf(
        RepositoryCorruptError,
      );
      expect(await readFile(filePath, "utf8")).toBe(invalidSource);
      await expect(catalog.listRepositories()).resolves.toMatchObject({
        issues: [{ code: "repository_corrupt", id: "system-todo" }],
      });
      expect(await readFile(filePath, "utf8")).toBe(invalidSource);
    });
  });
});
