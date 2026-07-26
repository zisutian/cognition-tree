// SPDX-License-Identifier: GPL-3.0-or-later

import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JournalContentDto } from "../../../contracts/journal/types.ts";
import type { TodoContentDto } from "../../../contracts/todo/types.ts";
import { migrateTodoV3Content } from "../../../contracts/todo/migrations/todoV3ToV4.ts";
import { renameTodoCollection } from "../../../core/todo/commands/todoCommands.ts";
import { BuiltInCatalog } from "../../../infrastructure/server/repository/builtInCatalog.ts";
import { createFileSystemTodoContentStore } from "../../../infrastructure/server/repository/todoContentStore.ts";
import {
  VersionedContentRevisionConflictError,
  type VersionedContentStore,
} from "../../../infrastructure/server/repository/versionedContentStore.ts";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
} from "../../journal/journalTestFixture.ts";
import {
  appendTodoTestCollection,
  createEmptyTodoContent,
  todoCollectionId,
  todoTimestamp,
} from "../../todo/todoTestFixture.ts";

async function withStateDirectory(
  run: (stateDirectory: string) => Promise<void>,
) {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "ctn-built-ins-"));

  try {
    await chmod(stateDirectory, 0o700);
    await run(stateDirectory);
  } finally {
    await rm(stateDirectory, { force: true, recursive: true });
  }
}

function openBuiltInStore<Content>(
  catalog: BuiltInCatalog,
  id: "journal" | "todo",
) {
  return catalog.getStore(id) as Promise<VersionedContentStore<Content>>;
}

function createBuiltInCatalog(repositoryRoot: string) {
  return new BuiltInCatalog(repositoryRoot);
}

describe("filesystem built-in data catalog", () => {
  it("provisions protected Journal and Todo data in isolated private directories", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const catalog = createBuiltInCatalog(stateDirectory);

      await catalog.initialize();
      const listed = await catalog.listBuiltIns();
      const builtInsDirectory = path.join(stateDirectory, ".built-ins");

      expect(listed).toEqual({
        issues: [],
        repositories: [
          {
            id: "journal",
            label: "日记",
            location: {
              serverPath: path.join(
                builtInsDirectory,
                "journal",
                "content.json",
              ),
              type: "server",
            },
            protected: true,
          },
          {
            id: "todo",
            label: "代办",
            location: {
              serverPath: path.join(
                builtInsDirectory,
                "todo",
                "content.json",
              ),
              type: "server",
            },
            protected: true,
          },
        ],
      });
      expect((await lstat(builtInsDirectory)).mode & 0o777).toBe(0o700);
      for (const id of ["journal", "todo"] as const) {
        const directory = path.join(builtInsDirectory, id);

        expect((await lstat(directory)).mode & 0o777).toBe(0o700);
        expect((await lstat(path.join(directory, "content.json"))).mode & 0o777)
          .toBe(0o600);
        expect((await lstat(path.join(directory, "storage.epoch"))).mode & 0o777)
          .toBe(0o600);
      }
      expect("delete" in catalog).toBe(false);
      expect("rename" in catalog).toBe(false);
    });
  });

  it("persists each domain independently and enforces compare-and-swap", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const catalog = createBuiltInCatalog(stateDirectory);

      await catalog.initialize();
      const journalStore = await openBuiltInStore<JournalContentDto>(
        catalog,
        "journal",
      );
      const journalBase = await journalStore.loadSnapshot();
      const journalContent = appendJournalTestEntry(
        createEmptyJournalContent(),
        { createdAt: "2026-07-18T00:00:01.000Z", entryIndex: 1 },
      );
      await journalStore.commitSnapshot({
        baseRevision: journalBase.revision,
        content: journalContent,
      });
      const todoStore = await openBuiltInStore<TodoContentDto>(catalog, "todo");
      const todoBase = await todoStore.loadSnapshot();
      const todoContent = appendTodoTestCollection(createEmptyTodoContent(), {
        collectionIndex: 1,
        createdAt: todoTimestamp(1),
        name: "服务端",
      });
      const committed = await todoStore.commitSnapshot({
        baseRevision: todoBase.revision,
        content: todoContent,
      });

      const reopened = createBuiltInCatalog(stateDirectory);

      await reopened.initialize();
      await expect((await openBuiltInStore<JournalContentDto>(
        reopened,
        "journal",
      )).loadSnapshot()).resolves
        .toMatchObject({ content: journalContent });
      await expect((await openBuiltInStore<TodoContentDto>(
        reopened,
        "todo",
      )).loadSnapshot()).resolves
        .toEqual({ content: todoContent, revision: committed.revision });

      const contentPath = path.join(
        stateDirectory,
        ".built-ins",
        "todo",
        "content.json",
      );
      const first = createFileSystemTodoContentStore(contentPath);
      const second = createFileSystemTodoContentStore(contentPath);
      const concurrentBase = await first.loadSnapshot();
      const renamed = renameTodoCollection(todoContent, {
        collectionId: todoCollectionId(1),
        name: "另一个提交",
        updatedAt: todoTimestamp(2),
      });
      const outcomes = await Promise.allSettled([
        first.commitSnapshot({
          baseRevision: concurrentBase.revision,
          content: { ...todoContent, collections: [] },
        }),
        second.commitSnapshot({
          baseRevision: concurrentBase.revision,
          content: renamed,
        }),
      ]);

      expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      const rejected = outcomes.find(({ status }) => status === "rejected");

      expect(rejected).toMatchObject({
        reason: expect.any(VersionedContentRevisionConflictError),
        status: "rejected",
      });
    });
  });

  it("ignores a retired external built-in data directory", async () => {
    await withStateDirectory(async (temporaryRoot) => {
      const retiredStateDirectory = path.join(temporaryRoot, "server");
      const sourceRepositoryRoot = path.join(temporaryRoot, "old-repositories");
      const repositoryRoot = path.join(temporaryRoot, "repositories");

      await mkdir(retiredStateDirectory, { mode: 0o700 });
      await mkdir(sourceRepositoryRoot, { mode: 0o775 });
      await mkdir(repositoryRoot, { mode: 0o775 });
      const source = new BuiltInCatalog(sourceRepositoryRoot);

      await source.initialize();
      const journalStore = await openBuiltInStore<JournalContentDto>(
        source,
        "journal",
      );
      const base = await journalStore.loadSnapshot();
      const journalContent = appendJournalTestEntry(
        createEmptyJournalContent(),
        { createdAt: "2026-07-18T00:00:01.000Z", entryIndex: 1 },
      );

      await journalStore.commitSnapshot({
        baseRevision: base.revision,
        content: journalContent,
      });
      const retiredBuiltIns = path.join(retiredStateDirectory, "built-ins");

      await rename(
        path.join(sourceRepositoryRoot, ".built-ins"),
        retiredBuiltIns,
      );
      const current = new BuiltInCatalog(repositoryRoot);

      await current.initialize();
      await expect((await openBuiltInStore<JournalContentDto>(
        current,
        "journal",
      )).loadSnapshot()).resolves.toMatchObject({
        content: createEmptyJournalContent(),
      });
      expect((await lstat(retiredBuiltIns)).isDirectory()).toBe(true);
      await expect(current.listBuiltIns()).resolves.toMatchObject({
        repositories: [
          {
            id: "journal",
            location: {
              serverPath: path.join(
                repositoryRoot,
                ".built-ins",
                "journal",
                "content.json",
              ),
            },
          },
          { id: "todo" },
        ],
      });
      expect((await lstat(repositoryRoot)).mode & 0o777).toBe(0o775);
      expect((await lstat(path.join(repositoryRoot, ".built-ins"))).mode & 0o777)
        .toBe(0o700);
    });
  });

  it("re-provisions a lower current epoch without touching retired files or peer data", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const catalog = createBuiltInCatalog(stateDirectory);

      await catalog.initialize();
      const todoStore = await openBuiltInStore<TodoContentDto>(catalog, "todo");
      const todoBase = await todoStore.loadSnapshot();
      const todoContent = appendTodoTestCollection(createEmptyTodoContent(), {
        collectionIndex: 1,
        name: "必须保留",
      });
      await todoStore.commitSnapshot({
        baseRevision: todoBase.revision,
        content: todoContent,
      });
      const retiredDirectory = path.join(stateDirectory, "system-repositories");
      const retiredSource =
        '{"purpose":"system-journal","schemaVersion":2,"secret":"ignored"}\n';

      await mkdir(retiredDirectory, { mode: 0o700 });
      await writeFile(
        path.join(retiredDirectory, "system-journal.json"),
        retiredSource,
        { mode: 0o600 },
      );
      const journalDirectory = path.join(stateDirectory, ".built-ins", "journal");

      await writeFile(path.join(journalDirectory, "storage.epoch"), "2\n", {
        mode: 0o600,
      });
      const reopened = createBuiltInCatalog(stateDirectory);

      await reopened.initialize();
      await expect(readFile(
        path.join(retiredDirectory, "system-journal.json"),
        "utf8",
      )).resolves.toBe(retiredSource);
      await expect((await openBuiltInStore<JournalContentDto>(
        reopened,
        "journal",
      )).loadSnapshot()).resolves
        .toMatchObject({ content: createEmptyJournalContent() });
      await expect((await openBuiltInStore<TodoContentDto>(
        reopened,
        "todo",
      )).loadSnapshot()).resolves
        .toMatchObject({ content: todoContent });

      const repeated = createBuiltInCatalog(stateDirectory);

      await repeated.initialize();
      await expect((await openBuiltInStore<TodoContentDto>(
        repeated,
        "todo",
      )).loadSnapshot()).resolves
        .toMatchObject({ content: todoContent });
    });
  });

  it("migrates Todo v3 content before publishing epoch 4", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const initial = createBuiltInCatalog(stateDirectory);

      await initial.initialize();
      const v4 = appendTodoTestCollection(createEmptyTodoContent(), {
        collectionIndex: 1,
        createdAt: todoTimestamp(1),
        name: "迁移保留",
      });
      const v3 = {
        ...v4,
        collections: v4.collections.map(
          ({ recurrences: _, ...collection }) => collection,
        ),
        schemaVersion: 3 as const,
      };
      const todoDirectory = path.join(
        stateDirectory,
        ".built-ins",
        "todo",
      );
      const contentPath = path.join(todoDirectory, "content.json");
      const epochPath = path.join(todoDirectory, "storage.epoch");

      await writeFile(contentPath, `${JSON.stringify(v3)}\n`, { mode: 0o600 });
      await writeFile(epochPath, "3\n", { mode: 0o600 });
      const reopened = createBuiltInCatalog(stateDirectory);

      await reopened.initialize();
      await expect((await openBuiltInStore<TodoContentDto>(
        reopened,
        "todo",
      )).loadSnapshot()).resolves.toMatchObject({
        content: migrateTodoV3Content(v3),
      });
      await expect(readFile(epochPath, "utf8")).resolves.toBe("4\n");
    });
  });

  it("finishes an interrupted Todo migration without rewriting v4 content", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const initial = createBuiltInCatalog(stateDirectory);

      await initial.initialize();
      const content = appendTodoTestCollection(createEmptyTodoContent(), {
        collectionIndex: 1,
        createdAt: todoTimestamp(1),
        name: "已经迁移",
      });
      const todoDirectory = path.join(
        stateDirectory,
        ".built-ins",
        "todo",
      );
      const contentPath = path.join(todoDirectory, "content.json");
      const epochPath = path.join(todoDirectory, "storage.epoch");
      const compactSource = JSON.stringify(content);

      await writeFile(contentPath, compactSource, { mode: 0o600 });
      await writeFile(epochPath, "3\n", { mode: 0o600 });
      const reopened = createBuiltInCatalog(stateDirectory);

      await reopened.initialize();
      await expect(readFile(contentPath, "utf8")).resolves.toBe(compactSource);
      await expect(readFile(epochPath, "utf8")).resolves.toBe("4\n");
    });
  });

  it("preserves corrupt Todo v3 content and its old epoch", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const initial = createBuiltInCatalog(stateDirectory);

      await initial.initialize();
      const todoDirectory = path.join(
        stateDirectory,
        ".built-ins",
        "todo",
      );
      const contentPath = path.join(todoDirectory, "content.json");
      const epochPath = path.join(todoDirectory, "storage.epoch");
      const corrupt = '{"collections":[],"schemaVersion":3,"syntaxSource":1}\n';

      await writeFile(contentPath, corrupt, { mode: 0o600 });
      await writeFile(epochPath, "3\n", { mode: 0o600 });
      const reopened = createBuiltInCatalog(stateDirectory);

      await reopened.initialize();
      await expect(reopened.listBuiltIns()).resolves.toMatchObject({
        issues: [{ code: "repository_corrupt", id: "todo" }],
      });
      await expect(readFile(contentPath, "utf8")).resolves.toBe(corrupt);
      await expect(readFile(epochPath, "utf8")).resolves.toBe("3\n");
    });
  });

  it("preserves corrupt current content and future epochs without affecting the peer", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const catalog = createBuiltInCatalog(stateDirectory);

      await catalog.initialize();
      const journalContentPath = path.join(
        stateDirectory,
        ".built-ins",
        "journal",
        "content.json",
      );
      const todoDirectory = path.join(stateDirectory, ".built-ins", "todo");
      const todoContentPath = path.join(todoDirectory, "content.json");
      const todoBefore = await readFile(todoContentPath, "utf8");
      const corrupt = "{not-json\n";

      await writeFile(journalContentPath, corrupt, { mode: 0o600 });
      await writeFile(path.join(todoDirectory, "storage.epoch"), "5\n", {
        mode: 0o600,
      });
      const reopened = createBuiltInCatalog(stateDirectory);

      await reopened.initialize();
      await expect(reopened.listBuiltIns()).resolves.toMatchObject({
        issues: [
          { code: "repository_corrupt", id: "journal" },
          { code: "unsupported_repository_version", id: "todo" },
        ],
        repositories: [],
      });
      await expect(readFile(journalContentPath, "utf8")).resolves.toBe(corrupt);
      await expect(readFile(todoContentPath, "utf8")).resolves.toBe(todoBefore);
      await expect(readFile(
        path.join(todoDirectory, "storage.epoch"),
        "utf8",
      )).resolves.toBe("5\n");
    });
  });
});
