// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NoteFileStore } from "../../server/noteFileStore.mjs";
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

async function withTempStore(testFn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "ctn-file-store-"));

  try {
    return await testFn(new NoteFileStore(rootDir), rootDir);
  } finally {
    await rm(rootDir, { force: true, recursive: true });
  }
}

describe("NoteFileStore", () => {
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

[[markers]]
marker = "!"
type = "component"
label = "风险"
`,
        "utf8",
      );

      expect((await store.loadWorkspace()).syntaxProfiles).toEqual([
        defaultSyntaxProfile,
        {
          id: "ctn-custom",
          markerRules: [{ marker: "!", type: "component", label: "风险" }],
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

  it("creates, reads, and updates syntax profile files", async () => {
    await withTempStore(async (store) => {
      await store.saveSyntaxFile(
        "custom.toml",
        `id = "ctn-custom"
name = "自定义语法"
version = 1
spaceIndentUnit = 4

[[markers]]
marker = "!"
type = "component"
label = "风险"
`,
      );

      await expect(store.readSyntaxFile("custom.toml")).resolves.toMatchObject({
        fileName: "custom.toml",
        profile: {
          id: "ctn-custom",
          markerRules: [{ marker: "!", type: "component", label: "风险" }],
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

[[markers]]
marker = "!"
type = "component"
label = "风险"
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

[[markers]]
marker = "!"
type = "component"
label = "风险"
`,
      );

      await expect(store.deleteSyntaxFile("ctn-default.toml")).rejects.toThrow(
        "Cannot delete repository default syntax profile",
      );
      await expect(store.deleteSyntaxFile("other.toml")).resolves.toBeUndefined();
    });
  });
});
