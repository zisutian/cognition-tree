// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NoteFileStore } from "../../server/noteFileStore.mjs";

function createWorkspace() {
  return {
    id: "local-workspace",
    name: "本地笔记库",
    activeNoteId: "note-test",
    defaultSyntaxProfileId: "ctn-default",
    syntaxProfiles: [
      {
        id: "ctn-default",
        name: "默认 CTN 语法",
        version: 1,
        spaceIndentUnit: 4,
        markerRules: [{ marker: ":", type: "definition", label: "定义" }],
      },
    ],
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
      await expect(
        readFile(path.join(rootDir, "workspace.json"), "utf8").then(JSON.parse),
      ).resolves.toMatchObject({
        id: "local-workspace",
        notes: [
          {
            fileName: "note-test.ctn",
            id: "note-test",
            title: "测试笔记",
          },
        ],
      });

      expect(await store.loadWorkspace()).toEqual(workspace);
    });
  });

  it("clears workspace manifests and note files", async () => {
    await withTempStore(async (store) => {
      await store.saveWorkspace(createWorkspace());
      await store.clearWorkspace();

      expect(await store.loadWorkspace()).toBeNull();
    });
  });
});

