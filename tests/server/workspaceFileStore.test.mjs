// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceFileStore } from "../../server/workspaceFileStore.mjs";
import {
  defaultSyntaxProfile,
  formatSyntaxProfileToml,
} from "../../server/syntaxProfileToml.mjs";

function createWorkspace() {
  return {
    id: "local-workspace",
    name: "本地笔记库",
    activeNoteId: "note-test",
    notes: [
      {
        id: "note-test",
        title: "测试笔记",
        source: "测试笔记\n    : 文件保存",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z",
      },
    ],
    tree: [
      {
        id: "folder-inbox",
        kind: "folder",
        title: "仓库根目录",
        children: [
          {
            id: "tree-note-test",
            kind: "note",
            noteId: "note-test",
          },
        ],
      },
    ],
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createManifest() {
  const workspace = createWorkspace();

  return {
    activeNoteId: workspace.activeNoteId,
    id: workspace.id,
    name: workspace.name,
    notes: workspace.notes.map((note) => ({
      createdAt: note.createdAt,
      fileName: `${note.id}.ctn`,
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
spaceIndentUnit = 4

[concept]
type = "concept"
label = "顶格概念"
tone = "teal"

[[markers]]
marker = "!"
type = "component"
label = "风险"
role = "normal"
tone = "red"

[[inlineRules]]
kind = "paired"
open = "[["
close = "]]"
type = "global-reference"
label = "全局概念引用"
tone = "blue"
`;

describe("WorkspaceFileStore", () => {
  it("saves notes as .ctn files and loads workspace manifests", async () => {
    await withTempStore(async (store, rootDir) => {
      const workspace = createWorkspace();

      await store.saveWorkspace(workspace);

      expect(
        await readFile(path.join(rootDir, "notes", "note-test.ctn"), "utf8"),
      ).toBe("测试笔记\n    : 文件保存");
      expect(
        await readFile(path.join(rootDir, "syntax", "workspace.toml"), "utf8"),
      ).toBe(formatSyntaxProfileToml());
      await expect(
        readFile(path.join(rootDir, "workspace.json"), "utf8").then(JSON.parse),
      ).resolves.toEqual({
        activeNoteId: "note-test",
        id: "local-workspace",
        name: "本地笔记库",
        notes: [
          {
            createdAt: "2026-05-25T00:00:00.000Z",
            fileName: "note-test.ctn",
            id: "note-test",
            title: "测试笔记",
            updatedAt: "2026-05-25T00:00:00.000Z",
          },
        ],
        tree: workspace.tree,
      });

      expect(await store.loadWorkspace()).toEqual(workspace);
    });
  });

  it("clears workspace manifests and note files", async () => {
    await withTempStore(async (store) => {
      await store.saveWorkspace(createWorkspace());
      await store.clearWorkspace();

      expect(await store.loadWorkspace()).toEqual({
        ...createWorkspace(),
        activeNoteId: null,
        notes: [],
        tree: [
          {
            id: "folder-inbox",
            kind: "folder",
            title: "仓库根目录",
            children: [],
          },
        ],
      });
    });
  });

  it("reads and updates the workspace syntax file", async () => {
    await withTempStore(async (store) => {
      await expect(store.readSyntaxFile()).resolves.toMatchObject({
        fileName: "workspace.toml",
        profile: defaultSyntaxProfile,
      });

      await store.saveSyntaxFile(customSyntaxSource);

      await expect(store.readSyntaxFile()).resolves.toMatchObject({
        fileName: "workspace.toml",
        profile: {
          conceptRule: {
            label: "顶格概念",
            tone: "teal",
            type: "concept",
          },
          inlineRules: [
            {
              close: "]]",
              kind: "paired",
              label: "全局概念引用",
              open: "[[",
              tone: "blue",
              type: "global-reference",
            },
          ],
          markerRules: [
            {
              label: "风险",
              marker: "!",
              role: "normal",
              tone: "red",
              type: "component",
            },
          ],
        },
        source: customSyntaxSource,
      });
      await expect(store.loadWorkspace()).resolves.toMatchObject({
        id: "local-workspace",
        notes: [],
      });
    });
  });

  it("rejects invalid workspace syntax files", async () => {
    await withTempStore(async (store, rootDir) => {
      await store.saveWorkspace(createWorkspace());
      await writeFile(
        path.join(rootDir, "syntax", "workspace.toml"),
        "name = \"broken\"\n",
        "utf8",
      );

      await expect(store.readSyntaxFile()).rejects.toThrow(
        "Invalid syntax profile workspace.toml",
      );
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
        message: "unsafe file name",
        mutate(manifest) {
          manifest.notes[0].fileName = "../note-test.ctn";
        },
      },
      {
        message: "unknown note note-missing",
        mutate(manifest) {
          manifest.activeNoteId = "note-missing";
        },
      },
      {
        message: "duplicate tree node id",
        mutate(manifest) {
          manifest.tree[0].children.push(clone(manifest.tree[0].children[0]));
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
      await rm(path.join(rootDir, "notes", "note-test.ctn"));

      await expect(store.loadWorkspace()).rejects.toThrow(
        "Missing note source file: note-test.ctn",
      );
    });
  });

  it("rejects invalid workspace payloads without writing manifests", async () => {
    const cases = [
      {
        message: "unknown note note-missing",
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
        await readFile(path.join(rootDir, "notes", "note-test.ctn"), "utf8"),
      ).toBe("latest");
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
});
