import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SystemRepositoryStorageEpochByPurpose } from "../../../contracts/system-repository/storageEpoch.ts";
import { SystemRepositoryCatalog } from "../../../server/repository/systemRepositoryCatalog.ts";
import {
  validateSystemRepositoryContent,
  validateSystemRepositoryTransition,
} from "../../../server/repository/systemRepositoryStore.ts";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
} from "../../journal/journalTestFixture.ts";
import { createEmptyTodoContent } from "../../todo/todoTestFixture.ts";

const initialEpochs = {
  "system-journal": 1,
  "system-todo": 1,
} as const satisfies SystemRepositoryStorageEpochByPurpose;

function createCatalog(
  stateDirectory: string,
  expectedEpochByPurpose: SystemRepositoryStorageEpochByPurpose = initialEpochs,
) {
  return new SystemRepositoryCatalog(stateDirectory, {
    expectedEpochByPurpose,
    validateContent: validateSystemRepositoryContent,
    validateTransition: validateSystemRepositoryTransition,
  });
}

async function withStateDirectory(
  run: (stateDirectory: string) => Promise<void>,
) {
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), "ctn-system-epoch-"),
  );
  try {
    await chmod(stateDirectory, 0o700);
    await run(stateDirectory);
  } finally {
    await rm(stateDirectory, { force: true, recursive: true });
  }
}

describe("filesystem system repository storage epochs", () => {
  it("discards Todo v2 bytes at epoch 3 without parsing or preserving them", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const original = createCatalog(stateDirectory, {
        "system-journal": 1,
        "system-todo": 2,
      });

      await original.initialize();
      const systemDirectory = path.join(stateDirectory, "system-repositories");
      const todoPath = path.join(systemDirectory, "system-todo.json");
      const journalPath = path.join(systemDirectory, "system-journal.json");
      const journalBefore = await readFile(journalPath, "utf8");
      const oldSource = `${JSON.stringify({
        collections: [{
          completions: [],
          id: "todo-collection-00000000-0000-4000-8000-000000000001",
          source: "# 旧集合\n[] 永久丢弃的 v2 任务\n",
        }],
        purpose: "system-todo",
        schemaVersion: 2,
        syntaxSource: "invalid bytes are intentionally not parsed",
      })}\n`;

      await writeFile(todoPath, oldSource, { mode: 0o600 });
      const bumped = createCatalog(stateDirectory, {
        "system-journal": 1,
        "system-todo": 3,
      });

      await bumped.initialize();
      await expect((await bumped.getStore("system-todo")).loadSnapshot())
        .resolves.toMatchObject({ content: createEmptyTodoContent() });
      await expect(readFile(todoPath, "utf8")).resolves.not.toContain(
        "永久丢弃的 v2 任务",
      );
      await expect(readFile(
        path.join(systemDirectory, "system-todo.epoch"),
        "utf8",
      )).resolves.toBe("3\n");
      await expect(readFile(journalPath, "utf8")).resolves.toBe(journalBefore);
    });
  });

  it("replaces only an old purpose and makes repeated initialization idempotent", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const original = createCatalog(stateDirectory);

      await original.initialize();
      const store = await original.getStore("system-journal");
      const initial = await store.loadSnapshot();
      const oldContent = appendJournalTestEntry(createEmptyJournalContent(), {
        createdAt: "2026-07-18T00:00:01.000Z",
        entryIndex: 1,
      });

      await store.commitSnapshot({
        baseRevision: initial.revision,
        content: oldContent,
      });
      const systemDirectory = path.join(stateDirectory, "system-repositories");
      const todoPath = path.join(systemDirectory, "system-todo.json");
      const todoBefore = await readFile(todoPath, "utf8");
      const bumpedEpochs = {
        "system-journal": 2,
        "system-todo": 1,
      } as const satisfies SystemRepositoryStorageEpochByPurpose;
      const bumped = createCatalog(stateDirectory, bumpedEpochs);

      await bumped.initialize();
      await expect((await bumped.getStore("system-journal")).loadSnapshot())
        .resolves.toMatchObject({ content: createEmptyJournalContent() });
      await expect(readFile(todoPath, "utf8")).resolves.toBe(todoBefore);
      await expect(readFile(
        path.join(systemDirectory, "system-journal.epoch"),
        "utf8",
      )).resolves.toBe("2\n");

      const reopened = createCatalog(stateDirectory, bumpedEpochs);

      await reopened.initialize();
      await expect((await reopened.getStore("system-journal")).loadSnapshot())
        .resolves.toMatchObject({ content: createEmptyJournalContent() });
    });
  });

  it("publishes the new epoch only after replacement succeeds", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const original = createCatalog(stateDirectory);

      await original.initialize();
      const systemDirectory = path.join(stateDirectory, "system-repositories");
      const journalPath = path.join(systemDirectory, "system-journal.json");
      const epochPath = path.join(systemDirectory, "system-journal.epoch");

      await rm(journalPath);
      await mkdir(journalPath, { mode: 0o700 });
      const bumped = createCatalog(stateDirectory, {
        "system-journal": 2,
        "system-todo": 1,
      });

      await bumped.initialize();
      await expect(bumped.listRepositories()).resolves.toMatchObject({
        issues: [{ id: "system-journal", status: "fault" }],
      });
      await expect(readFile(epochPath, "utf8")).resolves.toBe("1\n");
    });
  });

  it("preserves corrupt bytes at the current epoch", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const original = createCatalog(stateDirectory);

      await original.initialize();
      const journalPath = path.join(
        stateDirectory,
        "system-repositories",
        "system-journal.json",
      );
      const corruptSource = "{not-json\n";

      await writeFile(journalPath, corruptSource, { mode: 0o600 });
      const reopened = createCatalog(stateDirectory);

      await reopened.initialize();
      await expect(reopened.listRepositories()).resolves.toMatchObject({
        issues: [{ code: "repository_corrupt", id: "system-journal" }],
      });
      await expect(readFile(journalPath, "utf8")).resolves.toBe(corruptSource);
    });
  });

  it("preserves a future purpose epoch and keeps the other purpose available", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const original = createCatalog(stateDirectory);

      await original.initialize();
      const systemDirectory = path.join(stateDirectory, "system-repositories");
      const journalPath = path.join(systemDirectory, "system-journal.json");
      const epochPath = path.join(systemDirectory, "system-journal.epoch");
      const journalBefore = await readFile(journalPath, "utf8");

      await writeFile(epochPath, "2\n", { mode: 0o600 });
      const reopened = createCatalog(stateDirectory);

      await reopened.initialize();
      await expect(reopened.listRepositories()).resolves.toMatchObject({
        issues: [{
          code: "unsupported_repository_version",
          id: "system-journal",
        }],
        repositories: [{ id: "system-todo" }],
      });
      await expect(readFile(journalPath, "utf8")).resolves.toBe(journalBefore);
      await expect(readFile(epochPath, "utf8")).resolves.toBe("2\n");
      await expect((await reopened.getStore("system-todo")).loadSnapshot())
        .resolves.toMatchObject({ content: { purpose: "system-todo" } });
    });
  });
});
