// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { workspaceCommitPhases } from "../../server/workspaceCommitTransaction.mjs";
import { WorkspaceFileStore } from "../../server/workspaceFileStore.mjs";

function createWorkspace() {
  return {
    id: "local-workspace",
    name: "本地笔记库",
    notes: [
      {
        id: "note-test",
        title: "测试笔记",
        source: "测试笔记\n	: 文件保存",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z",
      },
    ],
    tree: [
      {
        children: [
          {
            id: "tree-note-test",
            kind: "note",
            noteId: "note-test",
          },
        ],
        id: "folder-docs",
        kind: "folder",
        title: "资料",
      },
    ],
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createRenamedWorkspace() {
  const workspace = createWorkspace();
  const note = workspace.notes[0];

  note.title = "重命名笔记";
  note.source = "重命名笔记\n\t: 新文件保存";
  note.updatedAt = "2026-05-26T00:00:00.000Z";

  return workspace;
}

function createManifest() {
  const workspace = createWorkspace();

  return {
    id: workspace.id,
    name: workspace.name,
    notes: workspace.notes.map((note) => ({
      createdAt: note.createdAt,
      fileName: `资料/${note.title}.ctn`,
      id: note.id,
      title: note.title,
      updatedAt: note.updatedAt,
    })),
    tree: workspace.tree,
  };
}

async function writeWorkspaceManifest(rootDir, manifest) {
  await writeFile(
    path.join(rootDir, "workspace.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

async function withTempStore(testFn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-file-store-"));

  try {
    return await testFn(new WorkspaceFileStore(rootDir), rootDir);
  } finally {
    await rm(rootDir, { force: true, recursive: true });
  }
}

const customSyntaxSource = `name = "自定义语法"
tabDisplayWidth = 4

[concept]
type = "concept"
label = "顶格概念"
tone = "teal"
textColor = "cyan"

[[markers]]
marker = "!"
type = "component"
label = "风险"
role = "normal"
tone = "red"
textColor = "amber"

[[inlineRules]]
kind = "paired"
open = "[["
close = "]]"
type = "global-reference"
label = "全局概念引用"
tone = "blue"
textColor = "cyan"
`;

describe("WorkspaceFileStore", () => {
  it("saves notes as .ctn files and loads workspace manifests", async () => {
    await withTempStore(async (store, rootDir) => {
      const workspace = createWorkspace();

      await store.saveWorkspace(workspace);

      expect(
        await readFile(
          path.join(rootDir, "notes", "资料", "测试笔记.ctn"),
          "utf8",
        ),
      ).toBe("测试笔记\n	: 文件保存");
      await expect(
        readFile(path.join(rootDir, "workspace.json"), "utf8").then(JSON.parse),
      ).resolves.toEqual({
        id: "local-workspace",
        name: "本地笔记库",
        notes: [
          {
            createdAt: "2026-05-25T00:00:00.000Z",
            fileName: "资料/测试笔记.ctn",
            id: "note-test",
            title: "测试笔记",
            updatedAt: "2026-05-25T00:00:00.000Z",
          },
        ],
        tree: workspace.tree,
      });

      expect(await store.loadWorkspace()).toEqual(workspace);
      await expect(store.readWorkspaceSyntaxSourceFile()).resolves.toBeNull();
    });
  });

  it("reads and updates the workspace syntax file", async () => {
    await withTempStore(async (store) => {
      await expect(store.readWorkspaceSyntaxSourceFile()).resolves.toBeNull();

      await store.saveWorkspaceSyntaxSource(customSyntaxSource);

      await expect(store.readWorkspaceSyntaxSourceFile()).resolves.toEqual({
        fileName: "workspace.toml",
        source: customSyntaxSource,
      });
      await expect(store.loadWorkspace()).resolves.toMatchObject({
        id: "local-workspace",
        notes: [],
      });
    });
  });

  it("stores workspace syntax source without parsing it", async () => {
    await withTempStore(async (store) => {
      const source = "name = \"broken\"\n";

      await store.saveWorkspaceSyntaxSource(source);

      await expect(store.readWorkspaceSyntaxSourceFile()).resolves.toEqual({
        fileName: "workspace.toml",
        source,
      });
    });
  });

  it("rejects invalid workspace manifest DTOs", async () => {
    const cases = [
      {
        message: "unsupported field",
        mutate(manifest) {
          manifest.extra = true;
        },
      },
      {
        message: "missing field",
        mutate(manifest) {
          delete manifest.notes;
        },
      },
      {
        message: "expected array",
        mutate(manifest) {
          manifest.notes = {};
        },
      },
      {
        message: "unsupported field",
        mutate(manifest) {
          manifest.notes[0].extra = true;
        },
      },
      {
        message: "duplicate note id",
        mutate(manifest) {
          manifest.notes.push(clone(manifest.notes[0]));
        },
      },
      {
        message: "unsafe path segment",
        mutate(manifest) {
          manifest.notes[0].fileName = "../note-test.ctn";
        },
      },
      {
        message: "note file must use .ctn",
        mutate(manifest) {
          manifest.notes[0].fileName = "资料/测试笔记.txt";
        },
      },
      {
        message: "unsupported field",
        mutate(manifest) {
          manifest.activeNoteId = "note-missing";
        },
      },
      {
        message: "duplicate tree node id",
        mutate(manifest) {
          manifest.tree.push(clone(manifest.tree[0]));
        },
      },
      {
        message: "unknown note note-missing",
        mutate(manifest) {
          manifest.tree[0].children[0].noteId = "note-missing";
        },
      },
    ];

    for (const testCase of cases) {
      await withTempStore(async (store, rootDir) => {
        const manifest = createManifest();

        testCase.mutate(manifest);
        await writeWorkspaceManifest(rootDir, manifest);

        await expect(store.loadWorkspace()).rejects.toThrow(testCase.message);
      });
    }
  });

  it("rejects workspace manifests that reference missing note files", async () => {
    await withTempStore(async (store, rootDir) => {
      await store.saveWorkspace(createWorkspace());
      await rm(path.join(rootDir, "notes", "资料", "测试笔记.ctn"));

      await expect(store.loadWorkspace()).rejects.toThrow(
        "Missing note source file: 资料/测试笔记.ctn",
      );
    });
  });

  it("rejects manifests whose paths or titles diverge from the workspace tree", async () => {
    await withTempStore(async (store, rootDir) => {
      await store.saveWorkspace(createWorkspace());

      const manifest = createManifest();
      manifest.notes[0].fileName = "note-test.ctn";
      await writeWorkspaceManifest(rootDir, manifest);
      await writeFile(
        path.join(rootDir, "notes", "note-test.ctn"),
        "测试笔记\n\t: 文件保存",
        "utf8",
      );

      await expect(store.loadWorkspace()).rejects.toThrow(
        "Workspace note file path does not match tree: note-test",
      );
    });

    await withTempStore(async (store, rootDir) => {
      await store.saveWorkspace(createWorkspace());
      await writeFile(
        path.join(rootDir, "notes", "资料", "测试笔记.ctn"),
        "错误标题\n\t: 文件保存",
        "utf8",
      );

      await expect(store.loadWorkspace()).rejects.toThrow(
        "Workspace note title does not match first line: note-test",
      );
    });
  });

  it("rejects invalid workspace payloads without writing manifests", async () => {
    const cases = [
      {
        message: "unsupported field",
        mutate(workspace) {
          workspace.activeNoteId = "note-missing";
        },
      },
      {
        message: "unsupported field",
        mutate(workspace) {
          workspace.notes[0].fileName = "custom.ctn";
        },
      },
      {
        message: "Workspace note title does not match first line",
        mutate(workspace) {
          workspace.notes[0].title = "错误标题";
        },
      },
      {
        message: "Unsafe note title",
        mutate(workspace) {
          workspace.notes[0].title = "非法/标题";
          workspace.notes[0].source = "非法/标题\n\t: 文件保存";
        },
      },
      {
        message: "Unsafe folder title",
        mutate(workspace) {
          workspace.tree[0].title = ".";
        },
      },
      {
        message: "Duplicate workspace file path",
        mutate(workspace) {
          workspace.notes.push({
            ...workspace.notes[0],
            id: "note-duplicate-title",
          });
          workspace.tree[0].children.push({
            id: "tree-note-duplicate-title",
            kind: "note",
            noteId: "note-duplicate-title",
          });
        },
      },
    ];

    for (const testCase of cases) {
      await withTempStore(async (store, rootDir) => {
        const workspace = createWorkspace();

        testCase.mutate(workspace);

        await expect(store.saveWorkspace(workspace)).rejects.toThrow(
          testCase.message,
        );
        await expect(readFile(path.join(rootDir, "workspace.json"), "utf8"))
          .rejects.toThrow("ENOENT");
      });
    }
  });

  it("serializes concurrent workspace saves in call order", async () => {
    await withTempStore(async (store, rootDir) => {
      const first = createWorkspace();
      const latest = createWorkspace();

      first.notes[0].source = "first";
      first.notes[0].title = "first";
      latest.notes[0].source = "latest";
      latest.notes[0].title = "latest";

      await Promise.all([
        store.saveWorkspace(first),
        store.saveWorkspace(latest),
      ]);

      expect(
        await readFile(path.join(rootDir, "notes", "资料", "latest.ctn"), "utf8"),
      ).toBe("latest");
      await expect(
        readFile(path.join(rootDir, "notes", "资料", "first.ctn"), "utf8"),
      ).rejects.toThrow("ENOENT");
      await expect(store.loadWorkspace()).resolves.toMatchObject({
        notes: [
          {
            source: "latest",
            title: "latest",
          },
        ],
      });
    });
  });

  it("recovers a complete workspace around every commit phase", async () => {
    const cases = [
      {
        phase: workspaceCommitPhases.prepared,
        expected: createWorkspace,
      },
      {
        phase: workspaceCommitPhases.previousNotesMoved,
        expected: createWorkspace,
      },
      {
        phase: workspaceCommitPhases.notesCommitted,
        expected: createWorkspace,
      },
      {
        phase: workspaceCommitPhases.manifestCommitted,
        expected: createRenamedWorkspace,
      },
      {
        phase: workspaceCommitPhases.cleanupCompleted,
        expected: createRenamedWorkspace,
      },
    ];

    for (const testCase of cases) {
      await withTempStore(async (initialStore, rootDir) => {
        await initialStore.saveWorkspace(createWorkspace());

        const interruptedStore = new WorkspaceFileStore(rootDir, {
          onWorkspaceCommitPhase(phase) {
            if (phase === testCase.phase) {
              throw new Error(`Interrupted at ${phase}`);
            }
          },
        });

        await expect(
          interruptedStore.saveWorkspace(createRenamedWorkspace()),
        ).rejects.toThrow(`Interrupted at ${testCase.phase}`);

        const recoveredStore = new WorkspaceFileStore(rootDir);
        const expectedWorkspace = testCase.expected();

        await expect(recoveredStore.loadWorkspace()).resolves.toEqual(
          expectedWorkspace,
        );
        await expect(
          readFile(path.join(rootDir, ".workspace-transaction.json"), "utf8"),
        ).rejects.toThrow("ENOENT");
        await expect(
          readFile(
            path.join(
              rootDir,
              "notes",
              "资料",
              `${expectedWorkspace.notes[0].title}.ctn`,
            ),
            "utf8",
          ),
        ).resolves.toBe(expectedWorkspace.notes[0].source);
      });
    }
  });

  it("restores overwritten note content when the manifest was not committed", async () => {
    await withTempStore(async (initialStore, rootDir) => {
      const originalWorkspace = createWorkspace();
      const updatedWorkspace = clone(originalWorkspace);

      updatedWorkspace.notes[0].source = "测试笔记\n\t: 未提交的新正文";
      updatedWorkspace.notes[0].updatedAt = "2026-05-26T00:00:00.000Z";

      await initialStore.saveWorkspace(originalWorkspace);

      const interruptedStore = new WorkspaceFileStore(rootDir, {
        onWorkspaceCommitPhase(phase) {
          if (phase === workspaceCommitPhases.notesCommitted) {
            throw new Error("Interrupted before manifest");
          }
        },
      });

      await expect(
        interruptedStore.saveWorkspace(updatedWorkspace),
      ).rejects.toThrow("Interrupted before manifest");

      const recoveredStore = new WorkspaceFileStore(rootDir);

      await expect(recoveredStore.loadWorkspace()).resolves.toEqual(
        originalWorkspace,
      );
    });
  });

  it("removes orphan transactions and atomic-write temporary files", async () => {
    await withTempStore(async (store, rootDir) => {
      const temporaryFileName =
        "workspace.json.123.00000000-0000-4000-8000-000000000000.tmp";
      const nestedTemporaryFileName =
        "note.ctn.123.00000000-0000-4000-8000-000000000001.tmp";
      const transactionDir = path.join(rootDir, ".workspace-transaction");

      await mkdir(path.join(rootDir, "notes"), { recursive: true });
      await mkdir(transactionDir, { recursive: true });
      await writeFile(path.join(rootDir, temporaryFileName), "temporary", "utf8");
      await writeFile(
        path.join(rootDir, "notes", nestedTemporaryFileName),
        "temporary",
        "utf8",
      );
      await writeFile(
        path.join(transactionDir, "orphan.ctn"),
        "orphan",
        "utf8",
      );

      await store.initialize();

      await expect(
        readFile(path.join(rootDir, temporaryFileName), "utf8"),
      ).rejects.toThrow("ENOENT");
      await expect(
        readFile(path.join(rootDir, "notes", nestedTemporaryFileName), "utf8"),
      ).rejects.toThrow("ENOENT");
      await expect(
        readFile(path.join(transactionDir, "orphan.ctn"), "utf8"),
      ).rejects.toThrow("ENOENT");
    });
  });
});
