// SPDX-License-Identifier: GPL-3.0-or-later

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  lstat,
  link,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCtnCanonicalDocument } from "../../../../ctn/parser/parseCtnDocument.ts";
import { defaultCtnSyntaxProfile } from "../../../../ctn/syntax/defaultSyntaxProfile.ts";
import { formatSyntaxProfileToml } from "../../../../ctn/syntax/profileToml.ts";
import { WorkspaceRepositoryContractError } from "../../../../contracts/workspace-repository/contractValue";
import type {
  RepositoryTreeNodeDto,
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace-repository/types";
import {
  localRepositoryDeletionPhases,
  LocalRepositoryCatalog,
} from "../../../../server/adapters/local/localRepositoryCatalog.ts";
import {
  workspaceCommitPhases,
  type WorkspaceCommitPhase,
} from "../../../../server/adapters/local/workingTreeTransaction.ts";
import {
  createWorkspaceFileRepository,
  WorkspaceFileStore,
} from "../../../../server/adapters/local/workspaceFileStore.ts";
import {
  RepositoryCorruptError,
} from "../../../../server/repository/repositoryStore.ts";

const initialTimestamp = "2026-07-16T00:00:00.000Z";
const changedTimestamp = "2026-07-16T01:00:00.000Z";
const syntaxSource = formatSyntaxProfileToml(defaultCtnSyntaxProfile);

function blockId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function canonicalSource(title: string, body = "\t: 内容", idOffset = 0) {
  return [
    `@ctn-block id=${blockId(idOffset + 1)} created=${initialTimestamp} updated=${initialTimestamp}`,
    title,
    `\t@ctn-block id=${blockId(idOffset + 2)} created=${initialTimestamp} updated=${initialTimestamp}`,
    body,
  ].join("\n");
}

function createContent(name = "本地笔记库"): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 3,
    syntaxSource,
    workspace: {
      id: "workspace",
      name,
      notes: [{ id: "note-test", source: canonicalSource(name) }],
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
      notes: [{
        id: "deep-note",
        source: `@ctn-block id=${blockId(1)} created=${initialTimestamp} updated=${initialTimestamp}\ndeep source`,
      }],
      tree: [node],
    },
  };
}

function createStore(
  rootDir: string,
  options: {
    onWorkspaceCommitPhase?: (phase: WorkspaceCommitPhase) => Promise<void> | void;
  } = {},
) {
  let nextId = 100;
  return new WorkspaceFileStore(rootDir, {
    createBlockId: () => blockId(nextId++),
    createFolderId: () => `folder-${blockId(nextId++)}`,
    createNoteId: () => `note-${blockId(nextId++)}`,
    now: () => changedTimestamp,
    ...options,
  });
}

async function createFileRepository(
  rootDir: string,
  content = createContent(),
  label = "Test",
) {
  return createWorkspaceFileRepository({
    content,
    label,
    repositoryId: path.basename(rootDir),
    rootDir,
  });
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

describe("WorkspaceFileStore Local working tree", () => {
  it("round-trips canonical content through visible editable files and hidden control data", async () => {
    await withTempDir(async (rootDir) => {
      const initial = createContent();
      await createFileRepository(rootDir, initial, "Stable label");
      const store = createStore(rootDir);
      const snapshot = await store.loadSnapshot();

      expect(snapshot).toEqual({ content: initial, revision: snapshot.revision });
      expect(await readFile(path.join(rootDir, "资料", "本地笔记库.ctn"), "utf8"))
        .toBe("本地笔记库\n\t: 内容");
      expect(await readdir(rootDir)).toEqual([".ctn", "资料"]);
      const metadata = JSON.parse(await readFile(
        path.join(rootDir, ".ctn", "repository.json"),
        "utf8",
      ));
      expect(metadata).toMatchObject({
        currentRevision: snapshot.revision,
        label: "Stable label",
        layoutVersion: 1,
        repositoryId: path.basename(rootDir),
        schemaVersion: 3,
        workspace: { id: "workspace", name: "本地笔记库" },
      });
      const sidecarSource = await readFile(
        path.join(rootDir, ".ctn", "note-metadata", "note-test.json"),
        "utf8",
      );
      expect(sidecarSource).toContain('"editableSource": "本地笔记库\\n\\t: 内容"');
      expect(sidecarSource).not.toContain("@ctn-block");

      const next = createContent("renamed workspace");
      const committed = await store.commitSnapshot({
        baseRevision: snapshot.revision,
        content: next,
      });
      expect(await store.loadSnapshot()).toEqual({ content: next, revision: committed.revision });
      await expect(lstat(path.join(rootDir, "资料", "本地笔记库.ctn")))
        .rejects.toMatchObject({ code: "ENOENT" });
      expect(await readFile(path.join(rootDir, "资料", "renamed workspace.ctn"), "utf8"))
        .toBe("renamed workspace\n\t: 内容");
    });
  });

  it("keeps canonical-looking body directives visible in a syntax-free repository", async () => {
    await withTempDir(async (rootDir) => {
      const content: WorkspaceRepositoryContentDto = {
        schemaVersion: 3,
        syntaxSource: null,
        workspace: {
          id: "workspace-raw",
          name: "Raw",
          notes: [{
            id: "note-raw",
            source: canonicalSource("原始笔记", "\t? 未知语法", 500),
          }],
          tree: [{ kind: "note", noteId: "note-raw" }],
        },
      };

      await createFileRepository(rootDir, content, "Raw");
      const visibleSource = await readFile(path.join(rootDir, "原始笔记.ctn"), "utf8");

      expect(visibleSource).toContain(`\t@ctn-block id=${blockId(502)}`);
      const store = createStore(rootDir);
      expect((await store.loadSnapshot()).content).toEqual(content);
      expect((await store.loadSnapshot()).content).toEqual(content);
    });
  });

  it("fails a 10,000-level physical projection before leaving partial files", async () => {
    await withTempDir(async (rootDir) => {
      await expect(createFileRepository(rootDir, createDeepTreeContent(10_000), "Deep tree"))
        .rejects.toBeInstanceOf(WorkspaceRepositoryContractError);
      expect(await readdir(rootDir)).toEqual([]);
    });
  });

  it("detects external edit, add, rename and delete while preserving proven identities", async () => {
    await withTempDir(async (rootDir) => {
      await createFileRepository(rootDir);
      const store = createStore(rootDir);
      const base = await store.loadSnapshot();
      const originalPath = path.join(rootDir, "资料", "本地笔记库.ctn");
      await writeFile(originalPath, "本地笔记库\n\t: 内容已修改\n@ctn-block id=visible");
      const edited = await store.loadSnapshot();
      const parsed = parseCtnCanonicalDocument(
        edited.content.workspace.notes[0]!.source,
        defaultCtnSyntaxProfile,
      );

      expect(edited.revision).not.toBe(base.revision);
      expect(parsed.blocks[0]?.id).toBe(blockId(1));
      expect(parsed.blocks[1]?.id).toBe(blockId(2));
      expect(parsed.blocks[1]?.metadata.updatedAt).toBe(changedTimestamp);
      expect(parsed.blocks[2]?.rawText).toBe("@ctn-block id=visible");

      const renamedPath = path.join(rootDir, "资料", "重命名.ctn");
      await rename(originalPath, renamedPath);
      const renamed = await store.loadSnapshot();
      expect(await readFile(renamedPath, "utf8")).toMatch(/^重命名\n/);
      expect(renamed.content.workspace.notes[0]!.id).toBe("note-test");

      await writeFile(path.join(rootDir, "资料", "新增.ctn"), "新增\n\t? 问题");
      const added = await store.loadSnapshot();
      expect(added.content.workspace.notes).toHaveLength(2);
      const addedNote = added.content.workspace.notes.find((note) => note.id !== "note-test");
      expect(addedNote?.id).toMatch(/^note-/);

      await rm(renamedPath);
      const deleted = await store.loadSnapshot();
      expect(deleted.content.workspace.notes).toEqual([addedNote]);
      await expect(lstat(path.join(rootDir, ".ctn", "note-metadata", "note-test.json")))
        .rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("coordinates a title-only external edit by renaming the visible file", async () => {
    await withTempDir(async (rootDir) => {
      await createFileRepository(rootDir);
      const store = createStore(rootDir);
      await store.loadSnapshot();
      const originalPath = path.join(rootDir, "资料", "本地笔记库.ctn");
      const renamedPath = path.join(rootDir, "资料", "正文改名.ctn");

      await writeFile(originalPath, "正文改名\n\t: 内容");
      const reloaded = await store.loadSnapshot();

      expect(reloaded.content.workspace.notes[0]?.id).toBe("note-test");
      await expect(lstat(originalPath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readFile(renamedPath, "utf8")).toBe("正文改名\n\t: 内容");
    });
  });

  it("degrades an unprovable external move plus edit to a new note identity", async () => {
    await withTempDir(async (rootDir) => {
      await createFileRepository(rootDir);
      const store = createStore(rootDir);
      await store.loadSnapshot();
      const originalPath = path.join(rootDir, "资料", "本地笔记库.ctn");

      await mkdir(path.join(rootDir, "外部目录"));
      await writeFile(
        path.join(rootDir, "外部目录", "移动且修改.ctn"),
        "移动且修改\n\t: 全新内容",
      );
      await rm(originalPath);
      const reloaded = await store.loadSnapshot();

      expect(reloaded.content.workspace.notes).toHaveLength(1);
      expect(reloaded.content.workspace.notes[0]?.id).not.toBe("note-test");
      await expect(lstat(
        path.join(rootDir, ".ctn", "note-metadata", "note-test.json"),
      )).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("loads externally malformed note syntax as diagnostics without rejecting content", async () => {
    await withTempDir(async (rootDir) => {
      await createFileRepository(rootDir);
      const store = createStore(rootDir);
      await store.loadSnapshot();
      const notePath = path.join(rootDir, "资料", "本地笔记库.ctn");

      await writeFile(
        notePath,
        "本地笔记库\n\t% 未知标记\n\t```ts\n\t\tconst value = 1;",
      );
      const reloaded = await store.loadSnapshot();
      const document = parseCtnCanonicalDocument(
        reloaded.content.workspace.notes[0]!.source,
        defaultCtnSyntaxProfile,
      );
      const codes = document.diagnostics.map(({ code }) => code);

      expect(codes).toContain("unknown-marker");
      expect(codes).toContain("unterminated-multiline-block");
      expect(await readFile(notePath, "utf8")).toContain("const value = 1;");
    });
  });

  it("preserves order within the same folder and appends external moves and additions deterministically", async () => {
    await withTempDir(async (rootDir) => {
      const content: WorkspaceRepositoryContentDto = {
        schemaVersion: 3,
        syntaxSource,
        workspace: {
          id: "workspace",
          name: "Order",
          notes: [
            { id: "note-one", source: canonicalSource("One", "\t: One", 10) },
            { id: "note-two", source: canonicalSource("Two", "\t: Two", 20) },
            { id: "note-three", source: canonicalSource("Three", "\t: Three", 30) },
          ],
          tree: [
            {
              children: [
                { kind: "note", noteId: "note-one" },
                { kind: "note", noteId: "note-two" },
              ],
              folderId: "folder-a",
              kind: "folder",
              title: "A",
            },
            {
              children: [{ kind: "note", noteId: "note-three" }],
              folderId: "folder-b",
              kind: "folder",
              title: "B",
            },
          ],
        },
      };
      await createFileRepository(rootDir, content);
      const store = createStore(rootDir);
      await store.loadSnapshot();
      await rename(path.join(rootDir, "A", "Two.ctn"), path.join(rootDir, "B", "Two.ctn"));
      await rename(path.join(rootDir, "A"), path.join(rootDir, "Renamed"));
      await writeFile(path.join(rootDir, "B", "Zulu.ctn"), "Zulu\n\t: new");
      await writeFile(path.join(rootDir, "B", "Alpha.ctn"), "Alpha\n\t: new");

      await store.loadSnapshot();
      const index = JSON.parse(await readFile(path.join(rootDir, ".ctn", "index.json"), "utf8"));
      const bNotes = index.entries
        .filter((entry: { kind: string; path: string }) =>
          entry.kind === "note" && entry.path.startsWith("B/"))
        .sort((left: { order: number }, right: { order: number }) => left.order - right.order)
        .map((entry: { path: string }) => entry.path);

      expect(bNotes).toEqual([
        "B/Three.ctn",
        "B/Alpha.ctn",
        "B/Two.ctn",
        "B/Zulu.ctn",
      ]);
      expect(index.entries).toContainEqual(expect.objectContaining({
        noteId: "note-one",
        order: 0,
        path: "Renamed/One.ctn",
      }));
    });
  });

  it("does not rewrite an unchanged visible note or its sidecar", async () => {
    await withTempDir(async (rootDir) => {
      const content: WorkspaceRepositoryContentDto = {
        schemaVersion: 3,
        syntaxSource,
        workspace: {
          id: "workspace",
          name: "Incremental",
          notes: [
            { id: "note-one", source: canonicalSource("One", "\t: One", 10) },
            { id: "note-two", source: canonicalSource("Two", "\t: Two", 20) },
          ],
          tree: [{
            children: [
              { kind: "note", noteId: "note-one" },
              { kind: "note", noteId: "note-two" },
            ],
            folderId: "folder-notes",
            kind: "folder",
            title: "Notes",
          }],
        },
      };
      await createFileRepository(rootDir, content);
      const store = createStore(rootDir);
      const base = await store.loadSnapshot();
      const unchangedPath = path.join(rootDir, "Notes", "Two.ctn");
      const unchangedSidecarPath = path.join(rootDir, ".ctn", "note-metadata", "note-two.json");
      const beforeFile = await lstat(unchangedPath);
      const beforeSidecar = await lstat(unchangedSidecarPath);
      const next: WorkspaceRepositoryContentDto = {
        ...content,
        workspace: {
          ...content.workspace,
          notes: [
            { id: "note-one", source: canonicalSource("One", "\t: One changed", 10) },
            content.workspace.notes[1]!,
          ],
        },
      };
      await store.commitSnapshot({ baseRevision: base.revision, content: next });
      const afterFile = await lstat(unchangedPath);
      const afterSidecar = await lstat(unchangedSidecarPath);

      expect(afterFile.ino).toBe(beforeFile.ino);
      expect(afterFile.mtimeMs).toBe(beforeFile.mtimeMs);
      expect(afterSidecar.ino).toBe(beforeSidecar.ino);
      expect(afterSidecar.mtimeMs).toBe(beforeSidecar.mtimeMs);
    });
  });

  it("rejects independently changed file and title names without overwriting either", async () => {
    await withTempDir(async (rootDir) => {
      await createFileRepository(rootDir);
      const store = createStore(rootDir);
      await store.loadSnapshot();
      const renamedPath = path.join(rootDir, "资料", "磁盘文件名.ctn");
      await rename(path.join(rootDir, "资料", "本地笔记库.ctn"), renamedPath);
      await writeFile(renamedPath, "正文标题\n\t: 内容");

      await expect(store.loadSnapshot()).rejects.toBeInstanceOf(RepositoryCorruptError);
      expect(await readFile(renamedPath, "utf8")).toBe("正文标题\n\t: 内容");
    });
  });

  it("requires every tracked note sidecar but removes a sidecar after an external note deletion", async () => {
    await withTempDir(async (rootDir) => {
      await createFileRepository(rootDir);
      const sidecarPath = path.join(rootDir, ".ctn", "note-metadata", "note-test.json");
      await rm(sidecarPath);
      await expect(createStore(rootDir).loadSnapshot())
        .rejects.toBeInstanceOf(RepositoryCorruptError);
    });
  });

  it("does not follow or project an unrelated visible symlink but blocks deleting its parent", async () => {
    await withTempDir(async (rootDir) => {
      const outsideDir = await mkdtemp(path.join(os.tmpdir(), "ctn-local-visible-link-"));
      try {
        await createFileRepository(rootDir);
        const store = createStore(rootDir);
        const base = await store.loadSnapshot();
        await writeFile(path.join(outsideDir, "outside.ctn"), "Outside\n\t: untouched");
        await symlink(outsideDir, path.join(rootDir, "资料", "external"), "dir");

        await expect(store.loadSnapshot()).resolves.toMatchObject({
          content: base.content,
          revision: base.revision,
        });
        const empty: WorkspaceRepositoryContentDto = {
          ...base.content,
          workspace: { ...base.content.workspace, notes: [], tree: [] },
        };
        await expect(store.commitSnapshot({
          baseRevision: base.revision,
          content: empty,
        })).rejects.toMatchObject({ code: "invalid_request" });
        expect(await readFile(path.join(outsideDir, "outside.ctn"), "utf8"))
          .toBe("Outside\n\t: untouched");
      } finally {
        await rm(outsideDir, { force: true, recursive: true });
      }
    });
  });

  it("rejects invalid projected names, logical sibling collisions and unmanaged folder deletion", async () => {
    await withTempDir(async (rootDir) => {
      await createFileRepository(rootDir);
      const store = createStore(rootDir);
      const base = await store.loadSnapshot();
      const invalid = createContent("Bad/Title");
      await expect(store.commitSnapshot({ baseRevision: base.revision, content: invalid }))
        .rejects.toBeInstanceOf(WorkspaceRepositoryContractError);

      for (const invalidTitle of [
        "Bad?Title",
        "Cafe\u0301",
        "界".repeat(84),
      ]) {
        await expect(store.commitSnapshot({
          baseRevision: base.revision,
          content: createContent(invalidTitle),
        })).rejects.toBeInstanceOf(WorkspaceRepositoryContractError);
      }

      const collision = createContent("资料");
      collision.workspace.tree = [
        { children: [], folderId: "folder-collision", kind: "folder", title: "same" },
        { kind: "note", noteId: "note-test" },
      ];
      collision.workspace.notes[0]!.source = canonicalSource("Same");
      await expect(store.commitSnapshot({ baseRevision: base.revision, content: collision }))
        .rejects.toBeInstanceOf(WorkspaceRepositoryContractError);

      await writeFile(path.join(rootDir, "资料", "keep.txt"), "unmanaged");
      const empty: WorkspaceRepositoryContentDto = {
        ...createContent(),
        workspace: { ...createContent().workspace, notes: [], tree: [] },
      };
      await expect(store.commitSnapshot({ baseRevision: base.revision, content: empty }))
        .rejects.toMatchObject({ code: "invalid_request" });
      expect(await readFile(path.join(rootDir, "资料", "keep.txt"), "utf8"))
        .toBe("unmanaged");
    });
  });

  it("rejects stale commits and corrupted hidden metadata", async () => {
    await withTempDir(async (rootDir) => {
      await createFileRepository(rootDir);
      const store = createStore(rootDir);
      const base = await store.loadSnapshot();
      const committed = await store.commitSnapshot({
        baseRevision: base.revision,
        content: createContent("new"),
      });
      await expect(store.commitSnapshot({
        baseRevision: base.revision,
        content: createContent("stale"),
      })).rejects.toMatchObject({ currentRevision: committed.revision });
      await writeFile(
        path.join(rootDir, ".ctn", "repository.json"),
        JSON.stringify({ currentRevision: "not-a-revision" }),
      );
      await expect(createStore(rootDir).loadSnapshot())
        .rejects.toBeInstanceOf(RepositoryCorruptError);
    });
  });

  it("rejects the removed snapshot layout and never creates data during ordinary load", async () => {
    await withTempDir(async (rootDir) => {
      await writeFile(path.join(rootDir, "repository.json"), "{}\n");
      await mkdir(path.join(rootDir, "snapshots"));
      await expect(createStore(rootDir).loadSnapshot()).rejects.toMatchObject({
        name: "UnsupportedRepositoryVersionError",
      });
    });
    await withTempDir(async (rootDir) => {
      await expect(createStore(rootDir).loadSnapshot())
        .rejects.toBeInstanceOf(RepositoryCorruptError);
      expect(await readdir(rootDir)).toEqual([]);
    });
  });

  it("recovers a force-killed writer at every WAL phase as a complete old or new tree", async () => {
    for (const interruptedPhase of Object.values(workspaceCommitPhases)) {
      await withTempDir(async (rootDir) => {
        const oldContent = createContent("old");
        await createFileRepository(rootDir, oldContent);
        await runCrashChild(rootDir, interruptedPhase);
        const recovered = await createStore(rootDir).loadSnapshot();
        const expected = interruptedPhase === workspaceCommitPhases.headCommitted ||
            interruptedPhase === workspaceCommitPhases.cleanupCompleted
          ? createContent("new")
          : oldContent;
        expect(recovered.content).toEqual(expected);
      });
    }
  }, 30_000);

  it("retains WAL evidence and refuses recovery over an unknown external target change", async () => {
    await withTempDir(async (rootDir) => {
      await createFileRepository(rootDir, createContent("old"));
      await runCrashChild(rootDir, workspaceCommitPhases.workingTreeApplied);
      const targetPath = path.join(rootDir, "资料", "new.ctn");
      await writeFile(targetPath, "unknown external replacement");

      await expect(createStore(rootDir).loadSnapshot())
        .rejects.toBeInstanceOf(RepositoryCorruptError);
      expect(await readdir(path.join(rootDir, ".ctn", "transactions")))
        .toHaveLength(1);
      expect(await readFile(targetPath, "utf8")).toBe("unknown external replacement");
    });
  });

  it("rejects absolute target paths that cannot fit control files before creating data", async () => {
    await withTempDir(async (rootDir) => {
      const longRoot = path.join(rootDir, ...Array.from({ length: 21 }, () => "r".repeat(195)));
      await expect(createFileRepository(longRoot)).rejects.toBeInstanceOf(
        WorkspaceRepositoryContractError,
      );
      expect(await readdir(rootDir)).toEqual([]);
    });
  });

  it("does not report observer failure after the durable head commits", async () => {
    await withTempDir(async (rootDir) => {
      await createFileRepository(rootDir, createContent("old"));
      const store = createStore(rootDir, {
        onWorkspaceCommitPhase(phase) {
          if (phase === workspaceCommitPhases.headCommitted) {
            throw new Error("post-commit observer failed");
          }
        },
      });
      const base = await store.loadSnapshot();
      const content = createContent("new");
      const committed = await store.commitSnapshot({ baseRevision: base.revision, content });
      await expect(store.loadSnapshot()).resolves.toEqual({ content, revision: committed.revision });
    });
  });

  it("does not overwrite an empty directory added after WAL preparation", async () => {
    await withTempDir(async (rootDir) => {
      await createFileRepository(rootDir, createContent("old"));
      let injectExternalDirectory = true;
      const store = createStore(rootDir, {
        async onWorkspaceCommitPhase(phase) {
          if (phase === workspaceCommitPhases.filesDurable && injectExternalDirectory) {
            injectExternalDirectory = false;
            await mkdir(path.join(rootDir, "external-empty"));
          }
        },
      });
      const base = await store.loadSnapshot();

      await expect(store.commitSnapshot({
        baseRevision: base.revision,
        content: createContent("new"),
      })).rejects.toMatchObject({ code: "repository_busy" });
      expect(await lstat(path.join(rootDir, "external-empty"))).toMatchObject({});
      expect(await readFile(path.join(rootDir, "资料", "old.ctn"), "utf8"))
        .toContain("old");
      expect(await readdir(path.join(rootDir, ".ctn", "transactions"))).toEqual([]);
    });
  });

  it("stops accepting operations before draining an in-flight commit for deletion", async () => {
    await withTempDir(async (rootDir) => {
      await createFileRepository(rootDir, createContent("old"));
      let releaseCommit!: () => void;
      let signalCommitStarted!: () => void;
      const commitStarted = new Promise<void>((resolve) => { signalCommitStarted = resolve; });
      const commitReleased = new Promise<void>((resolve) => { releaseCommit = resolve; });
      const store = createStore(rootDir, {
        async onWorkspaceCommitPhase(phase) {
          if (phase === workspaceCommitPhases.stagingCreated) {
            signalCommitStarted();
            await commitReleased;
          }
        },
      });
      const base = await store.loadSnapshot();
      const commit = store.commitSnapshot({
        baseRevision: base.revision,
        content: createContent("new"),
      });
      await commitStarted;
      let deletionReady = false;
      const deletion = store.closeForDeletion().then(() => { deletionReady = true; });
      await expect(store.loadSnapshot()).rejects.toMatchObject({ code: "repository_not_found" });
      await Promise.resolve();
      expect(deletionReady).toBe(false);
      releaseCommit();
      await commit;
      await deletion;
      expect(deletionReady).toBe(true);
    });
  });
});

describe("LocalRepositoryCatalog v3", () => {
  it("removes abandoned create staging and deletion tombstone directories after locking", async () => {
    await withTempDir(async (rootDir) => {
      const staleStaging = path.join(
        rootDir,
        ".create-primary-00000000-0000-4000-8000-000000000001",
      );
      const staleDeletion = path.join(
        rootDir,
        ".delete-primary-00000000-0000-4000-8000-000000000002",
      );
      const unrelated = path.join(rootDir, ".create-user-content");

      await mkdir(staleStaging, { recursive: true });
      await mkdir(staleDeletion, { recursive: true });
      await mkdir(unrelated, { recursive: true });
      const catalog = new LocalRepositoryCatalog(rootDir);

      try {
        await catalog.initialize();
        expect(await readdir(rootDir)).toContain(".create-user-content");
        expect(await readdir(rootDir)).not.toContain(path.basename(staleStaging));
        expect(await readdir(rootDir)).not.toContain(path.basename(staleDeletion));
      } finally {
        await catalog.dispose();
      }
    });
  });

  it("holds one root writer lock and exposes server and display-only host paths", async () => {
    await withTempDir(async (rootDir) => {
      const first = new LocalRepositoryCatalog(rootDir, {
        hostRoot: "/host/repositories",
      });
      const second = new LocalRepositoryCatalog(rootDir);

      try {
        await first.initialize();
        await expect(second.initialize()).rejects.toMatchObject({ code: "repository_busy" });
        const descriptor = await first.createRepositoryWithId({
          content: createContent(),
          id: "primary",
          label: "Catalog label",
        });

        expect(descriptor).toEqual({
          adapter: "local",
          id: "primary",
          label: "Catalog label",
          location: {
            hostPath: "/host/repositories/primary",
            serverPath: path.join(rootDir, "primary"),
            type: "local",
          },
        });
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
        await catalog.createRepositoryWithId({ content: createContent(), id: "good", label: "Good" });
        await mkdir(path.join(rootDir, "broken"));
        await mkdir(path.join(rootDir, "legacy"));
        await writeFile(path.join(rootDir, "legacy", "workspace.json"), "{}\n");

        await expect(catalog.listRepositories()).resolves.toEqual({
          creatableAdapters: ["local"],
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

  it("never follows a control-directory symlink or accepts a hard-linked repository head", async () => {
    await withTempDir(async (rootDir) => {
      const catalog = new LocalRepositoryCatalog(rootDir);
      try {
        await catalog.createRepositoryWithId({
          content: createContent(),
          id: "good",
          label: "Good",
        });
        await catalog.createRepositoryWithId({
          content: createContent(),
          id: "linked-control",
          label: "Linked control",
        });
        const linkedControlTarget = path.join(rootDir, ".linked-control-target");
        await rename(
          path.join(rootDir, "linked-control", ".ctn"),
          linkedControlTarget,
        );
        await symlink(
          linkedControlTarget,
          path.join(rootDir, "linked-control", ".ctn"),
          "dir",
        );
        await mkdir(path.join(rootDir, "hard-head", ".ctn"), { recursive: true });
        await link(
          path.join(rootDir, "good", ".ctn", "repository.json"),
          path.join(rootDir, "hard-head", ".ctn", "repository.json"),
        );

        const listed = await catalog.listRepositories();
        expect(listed.repositories).toEqual([]);
        expect(listed.issues).toEqual(expect.arrayContaining([
          expect.objectContaining({ code: "repository_corrupt", id: "good" }),
          expect.objectContaining({ code: "repository_corrupt", id: "hard-head" }),
          expect.objectContaining({ code: "repository_corrupt", id: "linked-control" }),
        ]));
      } finally {
        await catalog.dispose();
      }
    });
  });

  it("deletes healthy and corrupt repositories idempotently", async () => {
    await withTempDir(async (rootDir) => {
      const catalog = new LocalRepositoryCatalog(rootDir);

      try {
        await catalog.createRepositoryWithId({ content: createContent(), id: "good", label: "Good" });
        const staleStore = await catalog.getStore("good");

        await mkdir(path.join(rootDir, "broken"));
        await expect(catalog.listRepositories()).resolves.toMatchObject({
          issues: [expect.objectContaining({ id: "broken" })],
          repositories: [expect.objectContaining({ id: "good" })],
        });

        await catalog.deleteRepository("good");
        await catalog.deleteRepository("good");
        await catalog.deleteRepository("broken");

        await expect(staleStore.loadSnapshot()).rejects.toMatchObject({
          code: "repository_not_found",
        });
        await expect(catalog.listRepositories()).resolves.toEqual({
          creatableAdapters: ["local"],
          issues: [],
          repositories: [],
        });
        await expect(lstat(path.join(rootDir, "good"))).rejects.toMatchObject({ code: "ENOENT" });
        await expect(lstat(path.join(rootDir, "broken"))).rejects.toMatchObject({ code: "ENOENT" });
        expect((await readdir(rootDir)).some((entry) => entry.startsWith(".delete-"))).toBe(false);
      } finally {
        await catalog.dispose();
      }
    });
  });

  it("refuses to delete the removed snapshot layout and preserves its contents", async () => {
    await withTempDir(async (rootDir) => {
      const repositoryPath = path.join(rootDir, "default");
      const revision = `sha256:${"a".repeat(64)}`;
      const snapshotPath = path.join(repositoryPath, "snapshots", revision);
      const metadataSource = JSON.stringify({
        currentRevision: revision,
        label: "Default",
        schemaVersion: 3,
      });
      const workspaceSource = JSON.stringify({
        id: "legacy-workspace",
        name: "Legacy workspace",
      });
      const catalog = new LocalRepositoryCatalog(rootDir);

      try {
        await mkdir(snapshotPath, { recursive: true });
        await writeFile(path.join(repositoryPath, "repository.json"), metadataSource);
        await writeFile(path.join(snapshotPath, "workspace.json"), workspaceSource);

        await expect(catalog.deleteRepository("default")).rejects.toMatchObject({
          code: "invalid_request",
        });

        expect((await lstat(repositoryPath)).isDirectory()).toBe(true);
        await expect(readFile(path.join(repositoryPath, "repository.json"), "utf8"))
          .resolves.toBe(metadataSource);
        await expect(readFile(path.join(snapshotPath, "workspace.json"), "utf8"))
          .resolves.toBe(workspaceSource);
      } finally {
        await catalog.dispose();
      }
    });
  });

  it("drains an in-flight commit before the catalog renames the repository", async () => {
    await withTempDir(async (rootDir) => {
      let releaseCommit!: () => void;
      let signalCommitStarted!: () => void;
      const commitStarted = new Promise<void>((resolve) => { signalCommitStarted = resolve; });
      const commitReleased = new Promise<void>((resolve) => { releaseCommit = resolve; });
      const catalog = new LocalRepositoryCatalog(rootDir, {
        createStore: (repositoryRoot) => createStore(repositoryRoot, {
          async onWorkspaceCommitPhase(phase) {
            if (phase === workspaceCommitPhases.stagingCreated) {
              signalCommitStarted();
              await commitReleased;
            }
          },
        }),
      });

      try {
        await catalog.createRepositoryWithId({
          content: createContent("old"),
          id: "primary",
          label: "Primary",
        });
        const store = await catalog.getStore("primary");
        const base = await store.loadSnapshot();
        const commit = store.commitSnapshot({
          baseRevision: base.revision,
          content: createContent("new"),
        });

        await commitStarted;
        let deletionFinished = false;
        const deletion = catalog.deleteRepository("primary")
          .then(() => { deletionFinished = true; });

        await Promise.resolve();
        expect(deletionFinished).toBe(false);
        expect(await lstat(path.join(rootDir, "primary"))).toMatchObject({});

        releaseCommit();
        await commit;
        await deletion;
        expect(deletionFinished).toBe(true);
        await expect(lstat(path.join(rootDir, "primary"))).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        releaseCommit?.();
        await catalog.dispose();
      }
    });
  });

  it("reopens the repository after a deletion failure before the durable commit point", async () => {
    await withTempDir(async (rootDir) => {
      let failDeletion = true;
      const catalog = new LocalRepositoryCatalog(rootDir, {
        onRepositoryDeletionPhase(phase) {
          if (phase === localRepositoryDeletionPhases.tombstoneRenamed && failDeletion) {
            failDeletion = false;
            throw new Error("injected pre-commit deletion failure");
          }
        },
      });

      try {
        await catalog.createRepositoryWithId({
          content: createContent(),
          id: "primary",
          label: "Primary",
        });
        const staleStore = await catalog.getStore("primary");

        await expect(catalog.deleteRepository("primary"))
          .rejects.toThrow("injected pre-commit deletion failure");
        await expect(staleStore.loadSnapshot()).rejects.toMatchObject({
          code: "repository_not_found",
        });

        const reopenedStore = await catalog.getStore("primary");

        await expect(reopenedStore.loadSnapshot()).resolves.toMatchObject({
          content: createContent(),
        });
        expect((await readdir(rootDir)).some((entry) => entry.startsWith(".delete-"))).toBe(false);
        await expect(catalog.deleteRepository("primary")).resolves.toBeUndefined();
      } finally {
        await catalog.dispose();
      }
    });
  });

  it("rejects symlink and path-escape deletion without touching outside data", async () => {
    await withTempDir(async (rootDir) => {
      const outsideDir = await mkdtemp(path.join(os.tmpdir(), "ctn-v3-local-outside-"));
      const catalog = new LocalRepositoryCatalog(rootDir);

      try {
        await writeFile(path.join(outsideDir, "keep.txt"), "keep");
        await symlink(outsideDir, path.join(rootDir, "linked"), "dir");

        await expect(catalog.deleteRepository("linked")).rejects.toMatchObject({
          code: "invalid_request",
        });
        await expect(catalog.deleteRepository("../outside")).rejects.toMatchObject({
          code: "invalid_request",
        });
        await expect(readFile(path.join(outsideDir, "keep.txt"), "utf8")).resolves.toBe("keep");
        expect((await lstat(path.join(rootDir, "linked"))).isSymbolicLink()).toBe(true);
      } finally {
        await catalog.dispose();
        await rm(outsideDir, { force: true, recursive: true });
      }
    });
  });

  it("refuses whole-repository deletion when visible unmanaged data or nested symlinks exist", async () => {
    await withTempDir(async (rootDir) => {
      const outsideDir = await mkdtemp(path.join(os.tmpdir(), "ctn-local-delete-outside-"));
      const catalog = new LocalRepositoryCatalog(rootDir);
      try {
        await catalog.createRepositoryWithId({
          content: createContent(),
          id: "primary",
          label: "Primary",
        });
        const repositoryPath = path.join(rootDir, "primary");
        await writeFile(path.join(repositoryPath, ".ctn", "secret.txt"), "not managed");
        await expect(catalog.deleteRepository("primary")).rejects.toMatchObject({
          code: "invalid_request",
        });
        await rm(path.join(repositoryPath, ".ctn", "secret.txt"));
        await writeFile(path.join(repositoryPath, "keep.txt"), "keep");
        await expect(catalog.deleteRepository("primary")).rejects.toMatchObject({
          code: "invalid_request",
        });
        expect(await readFile(path.join(repositoryPath, "keep.txt"), "utf8")).toBe("keep");

        await rm(path.join(repositoryPath, "keep.txt"));
        await writeFile(path.join(outsideDir, "outside.txt"), "outside");
        await symlink(outsideDir, path.join(repositoryPath, "资料", "linked"), "dir");
        await expect(catalog.deleteRepository("primary")).rejects.toMatchObject({
          code: "invalid_request",
        });
        expect(await readFile(path.join(outsideDir, "outside.txt"), "utf8")).toBe("outside");
      } finally {
        await catalog.dispose();
        await rm(outsideDir, { force: true, recursive: true });
      }
    });
  });
});
