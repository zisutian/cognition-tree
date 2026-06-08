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
    defaultSyntaxProfileId: "ctn-default",
    syntaxProfiles: [defaultSyntaxProfile],
    notes: [
      {
        id: "note-test",
        title: "测试笔记",
        source: "测试笔记\n    : 文件保存",
        syntaxProfileId: "ctn-default",
        syntaxVersion: 1,
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
    defaultSyntaxProfileId: workspace.defaultSyntaxProfileId,
    id: workspace.id,
    name: workspace.name,
    notes: workspace.notes.map((note) => ({
      createdAt: note.createdAt,
      fileName: `${note.id}.ctn`,
      id: note.id,
      syntaxProfileId: note.syntaxProfileId,
      syntaxVersion: note.syntaxVersion,
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

describe("WorkspaceFileStore", () => {
  it("saves notes as .ctn files and loads workspace manifests", async () => {
    await withTempStore(async (store, rootDir) => {
      const workspace = createWorkspace();

      await store.saveWorkspace(workspace);

      expect(
        await readFile(path.join(rootDir, "notes", "note-test.ctn"), "utf8"),
      ).toBe("测试笔记\n    : 文件保存");
      expect(
        await readFile(path.join(rootDir, "syntax", "ctn-default.toml"), "utf8"),
      ).toBe(formatSyntaxProfileToml());
      await expect(
        readFile(path.join(rootDir, "workspace.json"), "utf8").then(JSON.parse),
      ).resolves.toEqual({
        activeNoteId: "note-test",
        defaultSyntaxProfileId: "ctn-default",
        id: "local-workspace",
        name: "本地笔记库",
        notes: [
          {
            createdAt: "2026-05-25T00:00:00.000Z",
            fileName: "note-test.ctn",
            id: "note-test",
            syntaxProfileId: "ctn-default",
            syntaxVersion: 1,
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

  it("loads syntax profiles from syntax TOML files", async () => {
    await withTempStore(async (store, rootDir) => {
      const workspace = createWorkspace();

      await store.saveWorkspace(workspace);
      await writeFile(
        path.join(rootDir, "syntax", "custom.toml"),
        `id = "ctn-custom"
name = "自定义语法"
version = 1
spaceIndentUnit = 4
inlineRules = []

[[markers]]
marker = "!"
type = "component"
label = "风险"
role = "normal"
tone = "red"
`,
        "utf8",
      );

      expect((await store.loadWorkspace()).syntaxProfiles).toEqual([
        defaultSyntaxProfile,
        {
          id: "ctn-custom",
          inlineRules: [],
          markerRules: [
            {
              label: "风险",
              marker: "!",
              role: "normal",
              tone: "red",
              type: "component",
            },
          ],
          name: "自定义语法",
          spaceIndentUnit: 4,
          version: 1,
        },
      ]);
    });
  });

  it("rejects invalid syntax profile files", async () => {
    await withTempStore(async (store, rootDir) => {
      await store.saveWorkspace(createWorkspace());
      await writeFile(
        path.join(rootDir, "syntax", "broken.toml"),
        "id = \"broken\"\n",
        "utf8",
      );

      await expect(store.loadWorkspace()).rejects.toThrow(
        "Invalid syntax profile broken.toml",
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

  it("creates, reads, and updates syntax profile files", async () => {
    await withTempStore(async (store) => {
      await store.saveSyntaxFile(
        "custom.toml",
        `id = "ctn-custom"
name = "自定义语法"
version = 1
spaceIndentUnit = 4
inlineRules = []

[[markers]]
marker = "!"
type = "component"
label = "风险"
role = "normal"
tone = "red"
`,
      );

      await expect(store.readSyntaxFile("custom.toml")).resolves.toMatchObject({
        fileName: "custom.toml",
        profile: {
          id: "ctn-custom",
          inlineRules: [],
          markerRules: [
            {
              label: "风险",
              marker: "!",
              role: "normal",
              tone: "red",
              type: "component",
            },
          ],
          version: 1,
        },
      });
      await expect(store.listSyntaxFiles()).resolves.toHaveLength(2);
    });
  });

  it("rejects duplicate syntax profiles", async () => {
    await withTempStore(async (store) => {
      const source = `id = "ctn-duplicate"
name = "重复语法"
version = 1
spaceIndentUnit = 4
inlineRules = []

[[markers]]
marker = "!"
type = "component"
label = "风险"
role = "normal"
tone = "red"
`;

      await store.saveSyntaxFile("a.toml", source);

      await expect(
        store.saveSyntaxFile("b.toml", source),
      ).rejects.toThrow("Duplicate syntax profile ctn-duplicate@1");
    });
  });

  it("rejects deletion of referenced syntax profiles", async () => {
    await withTempStore(async (store) => {
      await store.saveWorkspace(createWorkspace());
      await store.saveSyntaxFile(
        "other.toml",
        `id = "ctn-other"
name = "其他语法"
version = 1
spaceIndentUnit = 4
inlineRules = []

[[markers]]
marker = "!"
type = "component"
label = "风险"
role = "normal"
tone = "red"
`,
      );

      await expect(store.deleteSyntaxFile("ctn-default.toml")).rejects.toThrow(
        "Cannot delete repository default syntax profile",
      );
      await expect(store.deleteSyntaxFile("other.toml")).resolves.toBeUndefined();
    });
  });
});
