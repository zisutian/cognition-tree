import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptySystemRepositoryContent } from "../../../contracts/system-repository/parseRepository.ts";
import { UnsupportedSystemRepositoryVersionError } from "../../../contracts/system-repository/contractValue.ts";
import { SystemRepositoryCatalog } from "../../../server/repository/systemRepositoryCatalog.ts";
import { RepositoryCorruptError } from "../../../server/repository/repositoryStore.ts";
import {
  FileSystemSystemRepositoryStore,
  SystemRepositoryRevisionConflictError,
} from "../../../server/repository/systemRepositoryStore.ts";

async function withStateDirectory(
  run: (stateDirectory: string) => Promise<void>,
) {
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "ctn-system-store-"));
  try {
    await chmod(stateDirectory, 0o700);
    await run(stateDirectory);
  } finally {
    await rm(stateDirectory, { force: true, recursive: true });
  }
}

describe("filesystem system repository catalog", () => {
  it("provisions each protected repository once with private permissions", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const catalog = new SystemRepositoryCatalog(stateDirectory);
      await catalog.initialize();
      const listed = await catalog.listRepositories();
      const systemDirectory = path.join(stateDirectory, "system-repositories");

      expect(listed).toEqual({
        issues: [],
        repositories: [
          {
            id: "system-journal",
            label: "日记",
            location: {
              serverPath: path.join(systemDirectory, "system-journal.json"),
              type: "server",
            },
            protected: true,
          },
          {
            id: "system-todo",
            label: "代办",
            location: {
              serverPath: path.join(systemDirectory, "system-todo.json"),
              type: "server",
            },
            protected: true,
          },
        ],
      });
      expect((await lstat(systemDirectory)).mode & 0o777).toBe(0o700);
      expect((await lstat(path.join(systemDirectory, "system-journal.json"))).mode & 0o777)
        .toBe(0o600);
      expect("deleteRepository" in catalog).toBe(false);
      expect("renameRepository" in catalog).toBe(false);
    });
  });

  it("keeps committed content across catalog recreation and enforces CAS", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const catalog = new SystemRepositoryCatalog(stateDirectory);
      await catalog.initialize();
      const store = await catalog.getStore("system-todo");
      const base = await store.loadSnapshot();
      const content = {
        collections: [{
          createdAt: "2026-07-18T01:00:00.000Z",
          id: "todo-collection-00000000-0000-4000-8000-000000000001",
          items: [],
          name: "服务端",
          updatedAt: "2026-07-18T01:00:00.000Z",
        }],
        purpose: "system-todo" as const,
        schemaVersion: 1 as const,
      };
      const committed = await store.commitSnapshot({
        baseRevision: base.revision,
        content,
      });
      const recreated = new SystemRepositoryCatalog(stateDirectory);
      await recreated.initialize();
      await expect((await recreated.getStore("system-todo")).loadSnapshot())
        .resolves.toEqual({ content, revision: committed.revision });

      const filePath = path.join(
        stateDirectory,
        "system-repositories",
        "system-todo.json",
      );
      const first = new FileSystemSystemRepositoryStore(filePath, "system-todo");
      const second = new FileSystemSystemRepositoryStore(filePath, "system-todo");
      const concurrentBase = await first.loadSnapshot();
      const firstContent = { ...content, collections: [] };
      const secondContent = {
        ...content,
        collections: [{ ...content.collections[0]!, name: "另一个提交" }],
      };
      const results = await Promise.allSettled([
        first.commitSnapshot({
          baseRevision: concurrentBase.revision,
          content: firstContent,
        }),
        second.commitSnapshot({
          baseRevision: concurrentBase.revision,
          content: secondContent,
        }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({
        reason: expect.any(SystemRepositoryRevisionConflictError),
        status: "rejected",
      });
    });
  });

  it("retains corrupt data, reports faults, and recovers only after external repair", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const systemDirectory = path.join(stateDirectory, "system-repositories");
      const journalPath = path.join(systemDirectory, "system-journal.json");
      const corruptSource = "{not-json\n";

      await mkdir(systemDirectory, { mode: 0o700 });
      await writeFile(journalPath, corruptSource, { mode: 0o600 });
      const catalog = new SystemRepositoryCatalog(stateDirectory);
      await catalog.initialize();

      expect(await catalog.listRepositories()).toMatchObject({
        issues: [{
          code: "repository_corrupt",
          id: "system-journal",
          status: "fault",
        }],
      });
      expect(await readFile(journalPath, "utf8")).toBe(corruptSource);
      await expect(catalog.retry("system-journal")).resolves.toEqual({ status: "fault" });
      expect(await readFile(journalPath, "utf8")).toBe(corruptSource);

      await writeFile(
        journalPath,
        `${JSON.stringify(createEmptySystemRepositoryContent("system-journal"))}\n`,
      );
      await chmod(journalPath, 0o600);
      await expect(catalog.retry("system-journal")).resolves.toEqual({ status: "ready" });

      await unlink(journalPath);
      await expect(catalog.retry("system-journal")).resolves.toEqual({ status: "ready" });
      await expect(readFile(journalPath, "utf8")).resolves.toContain(
        '"purpose": "system-journal"',
      );
    });
  });

  it("maps persisted contract violations to corruption while preserving version errors", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const catalog = new SystemRepositoryCatalog(stateDirectory);
      await catalog.initialize();
      const journalPath = path.join(
        stateDirectory,
        "system-repositories",
        "system-journal.json",
      );
      const store = new FileSystemSystemRepositoryStore(
        journalPath,
        "system-journal",
      );

      await writeFile(journalPath, JSON.stringify({
        entries: [{ id: "not-a-journal-entry" }],
        purpose: "system-journal",
        schemaVersion: 1,
      }));
      await expect(store.loadSnapshot()).rejects.toBeInstanceOf(
        RepositoryCorruptError,
      );

      await writeFile(journalPath, JSON.stringify({
        entries: [],
        purpose: "system-journal",
        schemaVersion: 2,
      }));
      await expect(store.loadSnapshot()).rejects.toBeInstanceOf(
        UnsupportedSystemRepositoryVersionError,
      );
    });
  });

  it("classifies unsafe files as corruption and root failures with null location", async () => {
    await withStateDirectory(async (stateDirectory) => {
      const catalog = new SystemRepositoryCatalog(stateDirectory);
      await catalog.initialize();
      const systemDirectory = path.join(stateDirectory, "system-repositories");
      const todoPath = path.join(systemDirectory, "system-todo.json");
      const targetPath = path.join(stateDirectory, "target.json");

      await writeFile(targetPath, "{}", { mode: 0o600 });
      await unlink(todoPath);
      await symlink(targetPath, todoPath);
      expect(await catalog.listRepositories()).toMatchObject({
        issues: [{
          code: "repository_corrupt",
          id: "system-todo",
          status: "fault",
        }],
      });
    });
    await withStateDirectory(async (stateDirectory) => {
      const invalidRoot = path.join(stateDirectory, "state-file");
      await writeFile(invalidRoot, "preserve", { mode: 0o600 });
      const catalog = new SystemRepositoryCatalog(invalidRoot);

      await catalog.initialize();
      expect(await catalog.listRepositories()).toEqual({
        issues: [
          expect.objectContaining({ id: "system-journal", location: null }),
          expect.objectContaining({ id: "system-todo", location: null }),
        ],
        repositories: [],
      });
      expect(await readFile(invalidRoot, "utf8")).toBe("preserve");
    });
  });
});
