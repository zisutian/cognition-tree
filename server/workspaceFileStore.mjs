// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  formatSyntaxProfileToml,
  parseSyntaxProfileToml,
} from "./syntaxProfileToml.mjs";
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

function createEmptyWorkspace(syntaxProfile) {
  return {
    id: "local-workspace",
    name: "本地笔记库",
    activeNoteId: null,
    syntaxProfile,
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

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export class WorkspaceFileStore {
  #rootDir;

  constructor(rootDir) {
    this.#rootDir = path.resolve(rootDir);
  }

  async initialize() {
    await mkdir(this.#notesDir, { recursive: true });
    await mkdir(this.#syntaxDir, { recursive: true });
    await this.#ensureDefaultSyntaxProfile();
  }

  get repositoryPath() {
    return this.#rootDir;
  }

  async loadWorkspace() {
    await this.initialize();
    const syntaxFile = await this.#readSyntaxFile();

    let manifest;

    try {
      manifest = await readJson(this.#manifestPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return createEmptyWorkspace(syntaxFile.profile);
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
      activeNoteId: manifest.activeNoteId,
      syntaxProfile: syntaxFile.profile,
      notes,
      tree: manifest.tree,
    };
  }

  async saveWorkspace(workspace) {
    assertWorkspacePayloadDto(workspace);
    await this.initialize();

    const expectedNoteFiles = new Set();
    const manifest = {
      id: workspace.id,
      name: workspace.name,
      activeNoteId: workspace.activeNoteId,
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
      await writeFile(path.join(this.#notesDir, noteFileName(note.id)), note.source, "utf8");
    }

    await this.#removeStaleNoteFiles(expectedNoteFiles);
    await writeJson(this.#manifestPath, manifest);
  }

  async clearWorkspace() {
    await rm(this.#manifestPath, { force: true });
    await rm(this.#notesDir, { force: true, recursive: true });
    await rm(this.#syntaxDir, { force: true, recursive: true });
    await mkdir(this.#notesDir, { recursive: true });
    await mkdir(this.#syntaxDir, { recursive: true });
    await this.#ensureDefaultSyntaxProfile();
  }

  async readSyntaxFile() {
    await this.initialize();

    return this.#readSyntaxFile();
  }

  async saveSyntaxFile(source) {
    await this.initialize();

    if (typeof source !== "string" || source.trim().length === 0) {
      throw new Error("Syntax profile source is empty");
    }

    const parsed = parseSyntaxProfileToml(source);

    if (!parsed.profile) {
      throw new Error(`Invalid syntax profile ${workspaceSyntaxFileName}: ${formatSyntaxDiagnostics(parsed)}`);
    }

    await writeFile(path.join(this.#syntaxDir, workspaceSyntaxFileName), source, "utf8");
  }

  async #ensureDefaultSyntaxProfile() {
    try {
      await readFile(path.join(this.#syntaxDir, workspaceSyntaxFileName), "utf8");
      return;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }

    await writeFile(
      path.join(this.#syntaxDir, workspaceSyntaxFileName),
      formatSyntaxProfileToml(),
      "utf8",
    );
  }

  async #readSyntaxFile() {
    const source = await readFile(path.join(this.#syntaxDir, workspaceSyntaxFileName), "utf8");
    const result = parseSyntaxProfileToml(source);

    if (!result.profile) {
      throw new Error(`Invalid syntax profile ${workspaceSyntaxFileName}: ${formatSyntaxDiagnostics(result)}`);
    }

    return {
      fileName: workspaceSyntaxFileName,
      profile: result.profile,
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
}

function formatSyntaxDiagnostics(result) {
  return result.diagnostics
    .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
    .join("; ");
}
