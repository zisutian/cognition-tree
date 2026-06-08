// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  defaultSyntaxProfile,
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
const defaultSyntaxFileName = `${defaultSyntaxProfile.id}.toml`;
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

function assertSafeSyntaxFileName(fileName) {
  assertSafeFileName(fileName, "syntax file name");

  if (!fileName.endsWith(".toml")) {
    throw new Error(`Syntax file must use .toml: ${fileName}`);
  }
}

function createEmptyWorkspace(syntaxProfiles) {
  const defaultProfile =
    syntaxProfiles.find((profile) => profile.id === defaultSyntaxProfile.id) ??
    syntaxProfiles[0] ??
    defaultSyntaxProfile;

  return {
    id: "local-workspace",
    name: "本地笔记库",
    activeNoteId: null,
    defaultSyntaxProfileId: defaultProfile.id,
    syntaxProfiles,
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
    const syntaxProfiles = await this.#readSyntaxProfiles();

    let manifest;

    try {
      manifest = await readJson(this.#manifestPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return createEmptyWorkspace(syntaxProfiles);
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
          syntaxProfileId: note.syntaxProfileId,
          syntaxVersion: note.syntaxVersion,
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
      defaultSyntaxProfileId: manifest.defaultSyntaxProfileId,
      syntaxProfiles,
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
      defaultSyntaxProfileId: workspace.defaultSyntaxProfileId,
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
    await rm(this.#syntaxDir, { force: true, recursive: true });
    await mkdir(this.#notesDir, { recursive: true });
    await mkdir(this.#syntaxDir, { recursive: true });
    await this.#ensureDefaultSyntaxProfile();
  }

  async listSyntaxFiles() {
    await this.initialize();

    return this.#readSyntaxProfileFiles();
  }

  async readSyntaxFile(fileName) {
    await this.initialize();

    return this.#readSyntaxProfileFile(fileName);
  }

  async saveSyntaxFile(fileName, source) {
    await this.initialize();
    assertSafeSyntaxFileName(fileName);

    if (typeof source !== "string" || source.trim().length === 0) {
      throw new Error("Syntax profile source is empty");
    }

    const parsed = parseSyntaxProfileToml(source);

    if (!parsed.profile) {
      throw new Error(`Invalid syntax profile ${fileName}: ${formatSyntaxDiagnostics(parsed)}`);
    }

    const existingFiles = await this.#readSyntaxProfileFiles({
      excludeFileName: fileName,
    });

    this.#assertUniqueSyntaxProfiles([
      ...existingFiles,
      { fileName, profile: parsed.profile, source },
    ]);

    await writeFile(path.join(this.#syntaxDir, fileName), source, "utf8");
  }

  async deleteSyntaxFile(fileName) {
    await this.initialize();

    const files = await this.#readSyntaxProfileFiles();
    const target = files.find((file) => file.fileName === fileName);

    if (!target) {
      throw new Error(`Syntax profile file not found: ${fileName}`);
    }

    if (files.length <= 1) {
      throw new Error("Cannot delete the last syntax profile file");
    }

    const manifest = await this.#readManifestOrNull();

    if (manifest?.defaultSyntaxProfileId === target.profile.id) {
      throw new Error(`Cannot delete repository default syntax profile: ${target.profile.id}`);
    }

    const referencingNote = (manifest?.notes ?? []).find(
      (note) =>
        note.syntaxProfileId === target.profile.id &&
        note.syntaxVersion === target.profile.version,
    );

    if (referencingNote) {
      throw new Error(`Cannot delete syntax profile used by note: ${referencingNote.id}`);
    }

    await rm(path.join(this.#syntaxDir, target.fileName));
  }

  async #ensureDefaultSyntaxProfile() {
    const entries = await readdir(this.#syntaxDir, { withFileTypes: true });
    const hasSyntaxProfile = entries.some(
      (entry) => entry.isFile() && entry.name.endsWith(".toml"),
    );

    if (hasSyntaxProfile) {
      return;
    }

    await writeFile(
      path.join(this.#syntaxDir, defaultSyntaxFileName),
      formatSyntaxProfileToml(),
      "utf8",
    );
  }

  async #readSyntaxProfiles() {
    return (await this.#readSyntaxProfileFiles()).map((file) => file.profile);
  }

  async #readSyntaxProfileFiles({ excludeFileName } = {}) {
    const entries = await readdir(this.#syntaxDir, { withFileTypes: true });
    const syntaxFileNames = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".toml"))
      .map((entry) => entry.name)
      .filter((fileName) => fileName !== excludeFileName)
      .sort((left, right) => left.localeCompare(right));

    if (syntaxFileNames.length === 0 && !excludeFileName) {
      return [
        {
          fileName: defaultSyntaxFileName,
          profile: defaultSyntaxProfile,
          source: formatSyntaxProfileToml(),
        },
      ];
    }

    if (syntaxFileNames.length === 0) {
      return [];
    }

    const files = [];

    for (const fileName of syntaxFileNames) {
      files.push(await this.#readSyntaxProfileFile(fileName));
    }

    this.#assertUniqueSyntaxProfiles(files);

    return files;
  }

  async #readSyntaxProfileFile(fileName) {
    assertSafeSyntaxFileName(fileName);

    const source = await readFile(path.join(this.#syntaxDir, fileName), "utf8");
    const result = parseSyntaxProfileToml(source);

    if (!result.profile) {
      throw new Error(`Invalid syntax profile ${fileName}: ${formatSyntaxDiagnostics(result)}`);
    }

    return {
      fileName,
      profile: result.profile,
      source,
    };
  }

  #assertUniqueSyntaxProfiles(files) {
    const profileKeys = new Map();

    for (const file of files) {
      const key = `${file.profile.id}@${file.profile.version}`;
      const existingFileName = profileKeys.get(key);

      if (existingFileName) {
        throw new Error(
          `Duplicate syntax profile ${key}: ${existingFileName}, ${file.fileName}`,
        );
      }

      profileKeys.set(key, file.fileName);
    }
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

  async #readManifestOrNull() {
    try {
      const manifest = await readJson(this.#manifestPath);

      assertWorkspaceManifestDto(manifest);

      return manifest;
    } catch (error) {
      if (error?.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }
}

function formatSyntaxDiagnostics(result) {
  return result.diagnostics
    .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
    .join("; ");
}
