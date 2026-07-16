// SPDX-License-Identifier: GPL-3.0-or-later

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceRepositoryContractError } from "../../../../contracts/workspace-repository/contractValue";
import type {
  RepositoryTreeNodeDto,
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace-repository/types";
import { LocalRepositoryCatalog } from "../../../../server/adapters/local/localRepositoryCatalog.ts";
import {
  workspaceCommitPhases,
  type WorkspaceCommitPhase,
} from "../../../../server/adapters/local/immutableSnapshotCommit.ts";
import {
  createWorkspaceFileRepository,
  WorkspaceFileStore,
} from "../../../../server/adapters/local/workspaceFileStore.ts";
import {
  RepositoryCorruptError,
} from "../../../../server/repository/repositoryStore.ts";

function createContent(name = "本地笔记库"): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 3,
    syntaxSource: 'name = "test"\n',
    workspace: {
      id: "workspace",
      name,
      notes: [{ id: "note-test", source: `${name}\n\t: 内容` }],
      tree: [
        {
          children: [{ kind: "note", noteId: "note-test" }],
          folderId: "folder-docs",
          kind: "folder",
          title: "资料",
        },
      ],
    },
  };
}

function createDeepTreeContent(depth: number): WorkspaceRepositoryContentDto {
  let node: RepositoryTreeNodeDto = { kind: "note", noteId: "deep-note" };

  for (let index = depth; index > 0; index -= 1) {
    node = {
      children: [node],
      folderId: `folder-${index}`,
      kind: "folder",
      title: `level ${index}`,
    };
  }

  return {
    schemaVersion: 3,
    syntaxSource: null,
    workspace: {
      id: "deep-workspace",
      name: "deep tree",
      notes: [{ id: "deep-note", source: "deep source" }],
      tree: [node],
    },
  };
}

async function withTempDir<Result>(run: (rootDir: string) => Promise<Result>) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-v3-local-"));

  try {
    return await run(rootDir);
  } finally {
    await rm(rootDir, { force: true, recursive: true });
  }
}

async function runCrashChild(rootDir: string, phase: WorkspaceCommitPhase) {
  const childPath = fileURLToPath(new URL("./localCommitCrashChild.ts", import.meta.url));
  const child = spawn(process.execPath, [
    "--import",
    "tsx",
    childPath,
    rootDir,
    phase,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  return new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal === "SIGKILL") {
        resolve();
        return;
      }
      reject(new Error(`Crash child exited with code ${code}: ${stderr}`));
    });
  });
}

async function runCatalogProbeChild(rootDir: string) {
  const childPath = fileURLToPath(new URL("./localCatalogProbeChild.ts", import.meta.url));
  const child = spawn(process.execPath, ["--import", "tsx", childPath, rootDir], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });

  return new Promise<{ code: number | null; stderr: string; stdout: string }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stderr, stdout }));
  });
}

describe("WorkspaceFileStore v3", () => {
  it("publishes immutable snapshots through the durable repository head", async () => {
    await withTempDir(async (rootDir) => {
      const initial = createContent();

      await createWorkspaceFileRepository({ content: initial, label: "Stable label", rootDir });
      const store = new WorkspaceFileStore(rootDir);
      const snapshot = await store.loadSnapshot();

      expect(snapshot).toEqual({ content: initial, revision: snapshot.revision });
      expect(snapshot.revision).toMatch(/^sha256:[0-9a-f]{64}$/);
      const metadata = JSON.parse(await readFile(path.join(rootDir, "repository.json"), "utf8"));

      expect(metadata).toEqual({
        currentRevision: snapshot.revision,
        label: "Stable label",
        schemaVersion: 3,
      });
      expect(await readFile(
        path.join(rootDir, "snapshots", snapshot.revision, "notes", "note-test.ctn"),
        "utf8",
      )).toBe(initial.workspace.notes[0]?.source);

      const next = createContent("renamed workspace");
      const committed = await store.commitSnapshot({
        baseRevision: snapshot.revision,
        content: next,
      });

      expect(await store.loadSnapshot()).toEqual({ content: next, revision: committed.revision });
      expect(await readdir(path.join(rootDir, "snapshots"))).toEqual([committed.revision]);
      expect(JSON.parse(await readFile(path.join(rootDir, "repository.json"), "utf8")).label)
        .toBe("Stable label");
    });
  });

  it("commits and loads a 10,000-level tree without recursive JSON encoding", async () => {
    await withTempDir(async (rootDir) => {
      await createWorkspaceFileRepository({
        content: createDeepTreeContent(10_000),
        label: "Deep tree",
        rootDir,
      });
      const snapshot = await new WorkspaceFileStore(rootDir).loadSnapshot();
      let current = snapshot.content.workspace.tree[0];
      let depth = 0;

      while (current?.kind === "folder") {
        depth += 1;
        current = current.children[0];
      }

      expect(depth).toBe(10_000);
      expect(current).toEqual({ kind: "note", noteId: "deep-note" });
    });
  });

  it("rejects stale commits and detects tampered or incomplete snapshots", async () => {
    await withTempDir(async (rootDir) => {
      await createWorkspaceFileRepository({ content: createContent(), label: "Test", rootDir });
      const store = new WorkspaceFileStore(rootDir);
      const base = await store.loadSnapshot();
      const committed = await store.commitSnapshot({
        baseRevision: base.revision,
        content: createContent("new"),
      });

      await expect(store.commitSnapshot({
        baseRevision: base.revision,
        content: createContent("stale"),
      })).rejects.toMatchObject({
        currentRevision: committed.revision,
      });
      await writeFile(
        path.join(rootDir, "snapshots", committed.revision, "notes", "note-test.ctn"),
        "tampered",
      );
      await expect(new WorkspaceFileStore(rootDir).loadSnapshot())
        .rejects.toBeInstanceOf(RepositoryCorruptError);
    });
  });

  it("classifies invalid persisted layout as corruption but invalid inbound content as a request error", async () => {
    await withTempDir(async (rootDir) => {
      await createWorkspaceFileRepository({ content: createContent(), label: "Test", rootDir });
      const store = new WorkspaceFileStore(rootDir);
      const base = await store.loadSnapshot();
      const invalidContent: WorkspaceRepositoryContentDto = {
        ...createContent("invalid inbound"),
        workspace: {
          ...createContent("invalid inbound").workspace,
          notes: [{ id: "../escape", source: "invalid inbound" }],
          tree: [{ kind: "note", noteId: "../escape" }],
        },
      };

      await expect(store.commitSnapshot({
        baseRevision: base.revision,
        content: invalidContent,
      })).rejects.toBeInstanceOf(WorkspaceRepositoryContractError);

      await writeFile(
        path.join(rootDir, "snapshots", base.revision, "workspace.json"),
        JSON.stringify({
          id: "workspace",
          name: "tampered",
          tree: [{ kind: "note", noteId: "../escape" }],
        }),
      );
      await expect(new WorkspaceFileStore(rootDir).loadSnapshot())
        .rejects.toBeInstanceOf(RepositoryCorruptError);
    });
  });

  it("keeps classifying repository metadata damage as corruption after initialization", async () => {
    await withTempDir(async (rootDir) => {
      await createWorkspaceFileRepository({ content: createContent(), label: "Test", rootDir });
      const store = new WorkspaceFileStore(rootDir);

      await store.loadSnapshot();
      await writeFile(path.join(rootDir, "repository.json"), JSON.stringify({
        currentRevision: "not-a-revision",
        label: "Test",
        schemaVersion: 3,
      }));
      await expect(store.loadSnapshot()).rejects.toBeInstanceOf(RepositoryCorruptError);
    });
  });

  it("never creates an empty repository during ordinary load", async () => {
    await withTempDir(async (rootDir) => {
      await expect(new WorkspaceFileStore(rootDir).loadSnapshot())
        .rejects.toBeInstanceOf(RepositoryCorruptError);
      expect(await readdir(rootDir)).toEqual([]);
    });
  });

  it("recovers a force-killed writer at every snapshot phase as a complete old or new snapshot", async () => {
    const phases = Object.values(workspaceCommitPhases);

    for (const interruptedPhase of phases) {
      await withTempDir(async (rootDir) => {
        const oldContent = createContent("old");

        await createWorkspaceFileRepository({ content: oldContent, label: "Test", rootDir });
        await runCrashChild(rootDir, interruptedPhase);
        const recovered = await new WorkspaceFileStore(rootDir).loadSnapshot();
        const expected = interruptedPhase === workspaceCommitPhases.headCommitted ||
            interruptedPhase === workspaceCommitPhases.cleanupCompleted
          ? createContent("new")
          : oldContent;

        expect(recovered.content).toEqual(expected);
      });
    }
  }, 20_000);

  it("does not report failure after the durable head has already committed", async () => {
    await withTempDir(async (rootDir) => {
      await createWorkspaceFileRepository({ content: createContent("old"), label: "Test", rootDir });
      const store = new WorkspaceFileStore(rootDir, {
        onWorkspaceCommitPhase(phase) {
          if (phase === workspaceCommitPhases.headCommitted) {
            throw new Error("post-commit observer failed");
          }
        },
      });
      const base = await store.loadSnapshot();
      const content = createContent("new");
      const committed = await store.commitSnapshot({ baseRevision: base.revision, content });

      await expect(store.loadSnapshot()).resolves.toEqual({
        content,
        revision: committed.revision,
      });
    });
  });
});

describe("LocalRepositoryCatalog v3", () => {
  it("removes abandoned catalog-create staging directories after taking the writer lock", async () => {
    await withTempDir(async (rootDir) => {
      const staleStaging = path.join(
        rootDir,
        ".create-primary-00000000-0000-4000-8000-000000000001",
      );
      const unrelated = path.join(rootDir, ".create-user-content");

      await mkdir(staleStaging, { recursive: true });
      await mkdir(unrelated, { recursive: true });
      const catalog = new LocalRepositoryCatalog(rootDir);

      try {
        await catalog.initialize();
        expect(await readdir(rootDir)).toContain(".create-user-content");
        expect(await readdir(rootDir)).not.toContain(path.basename(staleStaging));
      } finally {
        await catalog.dispose();
      }
    });
  });

  it("holds one root writer lock and exposes no absolute paths", async () => {
    await withTempDir(async (rootDir) => {
      const first = new LocalRepositoryCatalog(rootDir);
      const second = new LocalRepositoryCatalog(rootDir);

      try {
        await first.initialize();
        await expect(second.initialize()).rejects.toMatchObject({ code: "repository_busy" });
        const descriptor = await first.createRepository({
          content: createContent(),
          id: "primary",
          label: "Catalog label",
        });

        expect(descriptor).toEqual({
          adapter: "local",
          id: "primary",
          label: "Catalog label",
          locationLabel: "local:primary",
        });
        expect(JSON.stringify(descriptor)).not.toContain(rootDir);
        await first.dispose();
        await expect(second.initialize()).resolves.toBeUndefined();
      } finally {
        await first.dispose();
        await second.dispose();
      }
    });
  });

  it("rejects a writer in a separate process while the root lock is held", async () => {
    await withTempDir(async (rootDir) => {
      const owner = new LocalRepositoryCatalog(rootDir);

      try {
        await owner.initialize();
        const contender = await runCatalogProbeChild(rootDir);

        expect(contender).toMatchObject({
          code: 42,
        });
      } finally {
        await owner.dispose();
      }

      await expect(runCatalogProbeChild(rootDir)).resolves.toMatchObject({
        code: 0,
      });
    });
  }, 10_000);

  it("isolates corrupt and legacy repositories from healthy catalog entries", async () => {
    await withTempDir(async (rootDir) => {
      const catalog = new LocalRepositoryCatalog(rootDir);

      try {
        await catalog.initialize();
        await catalog.createRepository({ content: createContent(), id: "good", label: "Good" });
        await mkdir(path.join(rootDir, "broken"));
        await mkdir(path.join(rootDir, "legacy"));
        await writeFile(path.join(rootDir, "legacy", "workspace.json"), "{}\n");

        await expect(catalog.listRepositories()).resolves.toEqual({
          issues: [
            expect.objectContaining({ code: "repository_corrupt", id: "broken" }),
            expect.objectContaining({ code: "unsupported_repository_version", id: "legacy" }),
          ],
          repositories: [expect.objectContaining({ id: "good", label: "Good" })],
        });
      } finally {
        await catalog.dispose();
      }
    });
  });
});
