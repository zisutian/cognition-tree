// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  writeFileAtomically,
  writeJsonAtomically,
} from "./atomicWrite.mjs";
import {
  assertWorkspaceManifestDto,
  assertWorkspacePayloadDto,
} from "./workspaceManifestDto.mjs";

const workspaceFileName = "workspace.json";
const notesDirName = "notes";
const syntaxDirName = "syntax";
const workspaceSyntaxFileName = "workspace.toml";
const defaultFolderId = "folder-inbox";

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

function createEmptyWorkspace() {
  return {
    id: "local-workspace",
    name: "本地笔记库",
    notes: [],
    tree: [
      {
        id: defaultFolderId,
        kind: "folder",
        title: "仓库根目录",
        children: [],
      },
    ],
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export class WorkspaceFileStore {
  #rootDir;
  #writeQueue = Promise.resolve();

  constructor(rootDir) {
    this.#rootDir = path.resolve(rootDir);
  }

  async initialize() {
    await mkdir(this.#notesDir, { recursive: true });
    await mkdir(this.#syntaxDir, { recursive: true });
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
        return createEmptyWorkspace();
      }

      throw error;
    }

    assertWorkspaceManifestDto(manifest);

    const notes = [];

    for (const note of manifest.notes) {
      assertSafeFileName(note.fileName, "note file name");

      try {
        const source = await readFile(
          path.join(this.#notesDir, note.fileName),
          "utf8",
        );

        notes.push({
          id: note.id,
          title: note.title,
          source,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        });
      } catch (error) {
        if (error?.code === "ENOENT") {
          throw new Error(`Missing note source file: ${note.fileName}`);
        }

        throw error;
      }
    }

    return {
      id: manifest.id,
      name: manifest.name,
      notes,
      tree: manifest.tree,
    };
  }

  async saveWorkspace(workspace) {
    assertWorkspacePayloadDto(workspace);

    return this.#enqueueWrite(() => this.#saveWorkspace(workspace));
  }

  async #saveWorkspace(workspace) {
    await this.initialize();

    const expectedNoteFiles = new Set();
    const manifest = {
      id: workspace.id,
      name: workspace.name,
      notes: workspace.notes.map((note) => {
        const fileName = noteFileName(note.id);

        expectedNoteFiles.add(fileName);

        return {
          id: note.id,
          title: note.title,
          fileName,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        };
      }),
      tree: workspace.tree,
    };

    for (const note of workspace.notes) {
      await writeFileAtomically(
        path.join(this.#notesDir, noteFileName(note.id)),
        note.source,
      );
    }

    await this.#removeStaleNoteFiles(expectedNoteFiles);
    await writeJsonAtomically(this.#manifestPath, manifest);
  }

  async clearWorkspace() {
    return this.#enqueueWrite(() => this.#clearWorkspace());
  }

  async #clearWorkspace() {
    await rm(this.#manifestPath, { force: true });
    await rm(this.#notesDir, { force: true, recursive: true });
    await rm(this.#syntaxDir, { force: true, recursive: true });
    await mkdir(this.#notesDir, { recursive: true });
    await mkdir(this.#syntaxDir, { recursive: true });
  }

  async readSyntaxFile() {
    await this.initialize();

    return this.#readSyntaxFile();
  }

  async saveSyntaxFile(source) {
    return this.#enqueueWrite(() => this.#saveSyntaxFile(source));
  }

  async #saveSyntaxFile(source) {
    await this.initialize();

    if (typeof source !== "string" || source.trim().length === 0) {
      throw new Error("Syntax profile source is empty");
    }

    await writeFileAtomically(
      path.join(this.#syntaxDir, workspaceSyntaxFileName),
      source,
    );
  }

  async #readSyntaxFile() {
    let source;

    try {
      source = await readFile(
        path.join(this.#syntaxDir, workspaceSyntaxFileName),
        "utf8",
      );
    } catch (error) {
      if (error?.code === "ENOENT") {
        return null;
      }

      throw error;
    }

    return {
      fileName: workspaceSyntaxFileName,
      source,
    };
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

  get #syntaxDir() {
    return path.join(this.#rootDir, syntaxDirName);
  }

  #enqueueWrite(operation) {
    const result = this.#writeQueue.then(operation);

    this.#writeQueue = result.catch(() => undefined);
    return result;
  }
}
