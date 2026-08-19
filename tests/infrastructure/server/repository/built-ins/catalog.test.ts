// SPDX-License-Identifier: GPL-3.0-or-later

import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JournalContentDto } from "../../../../../contracts/journal/types.ts";
import type { TodoContentDto } from "../../../../../contracts/todo/types.ts";
import { renameTodoCollection } from "../../../../../core/todo/commands/todoCollectionCommands.ts";
import {
  createTodoParseIndex,
} from "../../../../../core/todo/indexes/todoParseIndex.ts";
import { BuiltInCatalog } from "../../../../../infrastructure/server/repository/built-ins/catalog.ts";
import { createFileSystemTodoContentStore } from "../../../../../infrastructure/server/repository/built-ins/todoStore.ts";
import {
  VersionedContentRevisionConflictError,
  type VersionedContentStore,
} from "../../../../../infrastructure/server/repository/versioned/contentStore.ts";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
} from "../../../../core/journal/journalTestFixture.ts";
import {
  appendTodoTestCollection,
  createEmptyTodoContent,
  todoCollectionId,
  todoTimestamp,
} from "../../../../core/todo/todoTestFixture.ts";

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
  it("keeps a command-prepared Todo index through commit and revision caching", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const catalog = createBuiltInCatalog(stateDirectory);

      await catalog.initialize();
      const store = await catalog.getStore("todo");
      const before = await store.loadSnapshot();
      const content = appendTodoTestCollection(before.content, {
        collectionIndex: 1,
        createdAt: todoTimestamp(1),
        name: "Prepared",
      });
      const projection = createTodoParseIndex(content, before.projection);
      const receipt = await store.commitPreparedSnapshot(
        { baseRevision: before.revision, content },
        projection,
      );

      expect(receipt.before).toBe(before);
      expect(receipt.after.projection).toBe(projection);
      expect((await store.loadSnapshot()).projection).toBe(projection);
    });
  });

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

      expect(committed.before).toMatchObject({
        content: todoBase.content,
        revision: todoBase.revision,
      });
      expect(committed.after).toMatchObject({
        content: todoContent,
        revision: committed.revision,
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
        .toMatchObject({ content: todoContent, revision: committed.revision });

      const contentPath = path.join(
        stateDirectory,
        ".built-ins",
        "todo",
        "content.json",
      );
      const first = createFileSystemTodoContentStore(contentPath);
      const second = createFileSystemTodoContentStore(contentPath);
      const concurrentBase = await first.loadSnapshot();
      const renamed = renameTodoCollection(
        todoContent,
        createTodoParseIndex(todoContent),
        {
        collectionId: todoCollectionId(1),
        name: "另一个提交",
        updatedAt: todoTimestamp(2),
        },
      );
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

  it("rejects noncurrent and partial domain state without rewriting it or its peer", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const initial = createBuiltInCatalog(stateDirectory);

      await initial.initialize();
      const journalStore = await openBuiltInStore<JournalContentDto>(
        initial,
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
      const todoDirectory = path.join(stateDirectory, ".built-ins", "todo");
      const todoContentPath = path.join(todoDirectory, "content.json");
      const todoEpochPath = path.join(todoDirectory, "storage.epoch");
      const noncurrentSource =
        '{"collections":[],"schemaVersion":3,"syntaxSource":"retained"}\n';

      await writeFile(todoContentPath, noncurrentSource, { mode: 0o600 });
      await writeFile(todoEpochPath, "3\n", { mode: 0o600 });
      const reopened = createBuiltInCatalog(stateDirectory);

      await reopened.initialize();
      await expect(reopened.listBuiltIns()).resolves.toMatchObject({
        issues: [{ code: "unsupported_repository_version", id: "todo" }],
        repositories: [{ id: "journal" }],
      });
      await expect(readFile(todoContentPath, "utf8")).resolves
        .toBe(noncurrentSource);
      await expect(readFile(todoEpochPath, "utf8")).resolves.toBe("3\n");
      await expect((await openBuiltInStore<JournalContentDto>(
        reopened,
        "journal",
      )).loadSnapshot()).resolves.toMatchObject({ content: journalContent });
    });

    await withStateDirectory(async (stateDirectory) => {
      const initial = createBuiltInCatalog(stateDirectory);

      await initial.initialize();
      const journalDirectory = path.join(
        stateDirectory,
        ".built-ins",
        "journal",
      );
      const contentPath = path.join(journalDirectory, "content.json");
      const epochPath = path.join(journalDirectory, "storage.epoch");
      const contentBefore = await readFile(contentPath, "utf8");

      await rm(epochPath);
      const reopened = createBuiltInCatalog(stateDirectory);

      await reopened.initialize();
      await expect(reopened.listBuiltIns()).resolves.toMatchObject({
        issues: [{ code: "repository_corrupt", id: "journal" }],
      });
      await expect(readFile(contentPath, "utf8")).resolves.toBe(contentBefore);
      await expect(lstat(epochPath)).rejects.toMatchObject({ code: "ENOENT" });
    });

    await withStateDirectory(async (stateDirectory) => {
      const initial = createBuiltInCatalog(stateDirectory);

      await initial.initialize();
      const todoDirectory = path.join(stateDirectory, ".built-ins", "todo");
      const contentPath = path.join(todoDirectory, "content.json");
      const epochPath = path.join(todoDirectory, "storage.epoch");
      const epochBefore = await readFile(epochPath, "utf8");

      await rm(contentPath);
      const reopened = createBuiltInCatalog(stateDirectory);

      await reopened.initialize();
      await expect(reopened.listBuiltIns()).resolves.toMatchObject({
        issues: [{ code: "repository_corrupt", id: "todo" }],
      });
      await expect(readFile(epochPath, "utf8")).resolves.toBe(epochBefore);
      await expect(lstat(contentPath)).rejects.toMatchObject({ code: "ENOENT" });
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
