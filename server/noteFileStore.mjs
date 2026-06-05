// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const workspaceFileName = "workspace.json";
const notesDirName = "notes";

function assertSafeFileName(fileName, label) {
  if (
    typeof fileName !== "string" ||
    fileName.length === 0 ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName === "." ||
    fileName === ".."
  ) {
    throw new Error(`Unsafe ${label}: ${fileName}`);
  }
}

function noteFileName(noteId) {
  assertSafeFileName(noteId, "note id");
  return `${noteId}.ctn`;
}

function pruneMissingNoteNodes(nodes, noteIds) {
  return nodes.flatMap((node) => {
    if (node.kind === "folder") {
      return [
        {
          ...node,
          children: pruneMissingNoteNodes(node.children ?? [], noteIds),
        },
      ];
    }

    if (node.kind === "note" && noteIds.has(node.noteId)) {
      return [node];
    }

    return [];
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export class NoteFileStore {
  #rootDir;

  constructor(rootDir) {
    this.#rootDir = path.resolve(rootDir);
  }

  async initialize() {
    await mkdir(this.#notesDir, { recursive: true });
  }

  get repositoryPath() {
    return this.#rootDir;
  }

  async loadWorkspace() {
    await this.initialize();

    let manifest;

    try {
      manifest = await readJson(this.#manifestPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return null;
      }

      throw error;
    }

    const notes = [];

    for (const note of manifest.notes ?? []) {
      assertSafeFileName(note.fileName, "note file name");

      let source;

      try {
        source = await readFile(path.join(this.#notesDir, note.fileName), "utf8");
      } catch (error) {
        if (error?.code === "ENOENT") {
          continue;
        }

        throw error;
      }

      notes.push({
        id: note.id,
        title: note.title,
        source,
        syntaxProfileId: note.syntaxProfileId,
        syntaxVersion: note.syntaxVersion,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      });
    }

    const noteIds = new Set(notes.map((note) => note.id));
    const activeNoteId = noteIds.has(manifest.activeNoteId)
      ? manifest.activeNoteId
      : null;

    return {
      id: manifest.id,
      name: manifest.name,
      activeNoteId,
      defaultSyntaxProfileId: manifest.defaultSyntaxProfileId ?? "ctn-default",
      syntaxProfiles: manifest.syntaxProfiles ?? [],
      notes,
      tree: pruneMissingNoteNodes(manifest.tree ?? [], noteIds),
    };
  }

  async saveWorkspace(workspace) {
    await this.initialize();

    const expectedNoteFiles = new Set();
    const manifest = {
      id: workspace.id,
      name: workspace.name,
      activeNoteId: workspace.activeNoteId,
      defaultSyntaxProfileId: workspace.defaultSyntaxProfileId,
      syntaxProfiles: workspace.syntaxProfiles,
      notes: workspace.notes.map((note) => {
        const fileName = noteFileName(note.id);

        expectedNoteFiles.add(fileName);

        return {
          id: note.id,
          title: note.title,
          fileName,
          syntaxProfileId: note.syntaxProfileId,
          syntaxVersion: note.syntaxVersion,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        };
      }),
      tree: workspace.tree,
    };

    for (const note of workspace.notes) {
      await writeFile(path.join(this.#notesDir, noteFileName(note.id)), note.source, "utf8");
    }

    await this.#removeStaleNoteFiles(expectedNoteFiles);
    await writeJson(this.#manifestPath, manifest);
  }

  async clearWorkspace() {
    await rm(this.#manifestPath, { force: true });
    await rm(this.#notesDir, { force: true, recursive: true });
    await mkdir(this.#notesDir, { recursive: true });
  }

  async #removeStaleNoteFiles(expectedNoteFiles) {
    let entries;

    try {
      entries = await readdir(this.#notesDir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") {
        return;
      }

      throw error;
    }

    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".ctn"))
        .filter((entry) => !expectedNoteFiles.has(entry.name))
        .map((entry) => rm(path.join(this.#notesDir, entry.name))),
    );
  }

  get #manifestPath() {
    return path.join(this.#rootDir, workspaceFileName);
  }

  get #notesDir() {
    return path.join(this.#rootDir, notesDirName);
  }
}

