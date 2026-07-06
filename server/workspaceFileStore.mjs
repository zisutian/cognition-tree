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

function assertSafePathSegment(segment, label) {
  if (
    typeof segment !== "string" ||
    segment.length === 0 ||
    segment.includes("/") ||
    segment.includes("\\") ||
    segment === "." ||
    segment === ".."
  ) {
    throw new Error(`Unsafe ${label}: ${segment}`);
  }
}

function assertSafeRelativeFilePath(filePath, label) {
  if (
    typeof filePath !== "string" ||
    filePath.length === 0 ||
    filePath.startsWith("/") ||
    filePath.includes("\\")
  ) {
    throw new Error(`Unsafe ${label}: ${filePath}`);
  }

  filePath.split("/").forEach((segment) =>
    assertSafePathSegment(segment, label),
  );
}

function noteFileName(noteTitle) {
  assertSafePathSegment(noteTitle, "note title");
  return `${noteTitle}.ctn`;
}

function inferNoteTitle(source) {
  return source.split("\n")[0]?.trim() ?? "";
}

function assertNoteTitleMatchesSource(note) {
  const sourceTitle = inferNoteTitle(note.source);

  if (note.title !== sourceTitle) {
    throw new Error(`Workspace note title does not match first line: ${note.id}`);
  }
}

function createNoteById(notes) {
  return new Map(notes.map((note) => [note.id, note]));
}

function createNoteFileLayout({
  noteById,
  nodes,
  parentSegments = [],
  usedNoteIds = new Set(),
  usedPaths = new Set(),
}) {
  const entries = [];
  const siblingNames = new Set();

  for (const node of nodes) {
    if (node.kind === "folder") {
      assertSafePathSegment(node.title, "folder title");

      if (siblingNames.has(node.title)) {
        throw new Error(`Duplicate workspace file path: ${path.posix.join(...parentSegments, node.title)}`);
      }

      siblingNames.add(node.title);
      entries.push(
        ...createNoteFileLayout({
          noteById,
          nodes: node.children,
          parentSegments: [...parentSegments, node.title],
          usedNoteIds,
          usedPaths,
        }),
      );
      continue;
    }

    const note = noteById.get(node.noteId);

    if (!note) {
      throw new Error(`Workspace note does not exist: ${node.noteId}`);
    }

    assertNoteTitleMatchesSource(note);

    if (usedNoteIds.has(note.id)) {
      throw new Error(`Duplicate workspace note placement: ${note.id}`);
    }

    usedNoteIds.add(note.id);

    const fileName = noteFileName(note.title);

    if (siblingNames.has(fileName)) {
      throw new Error(`Duplicate workspace file path: ${path.posix.join(...parentSegments, fileName)}`);
    }

    siblingNames.add(fileName);

    const relativePath = path.posix.join(...parentSegments, fileName);

    if (usedPaths.has(relativePath)) {
      throw new Error(`Duplicate workspace file path: ${relativePath}`);
    }

    usedPaths.add(relativePath);
    entries.push({
      note,
      relativePath,
    });
  }

  return entries;
}

function createWorkspaceNoteFileLayout(workspace) {
  workspace.notes.forEach(assertNoteTitleMatchesSource);

  const noteById = createNoteById(workspace.notes);
  const entries = createNoteFileLayout({
    noteById,
    nodes: workspace.tree,
  });
  const placedNoteIds = new Set(entries.map((entry) => entry.note.id));
  const missingNotes = workspace.notes.filter((note) => !placedNoteIds.has(note.id));

  if (missingNotes.length > 0) {
    throw new Error(`Workspace note is missing from tree: ${missingNotes[0].id}`);
  }

  return entries;
}

function createEmptyWorkspace() {
  return {
    id: "local-workspace",
    name: "本地笔记库",
    notes: [],
    tree: [],
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
      assertSafeRelativeFilePath(note.fileName, "note file path");

      try {
        const source = await readFile(
          path.join(this.#notesDir, ...note.fileName.split("/")),
          "utf8",
        );
        const sourceTitle = inferNoteTitle(source);

        if (note.title !== sourceTitle) {
          throw new Error(`Workspace note title does not match first line: ${note.id}`);
        }

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

    const workspace = {
      id: manifest.id,
      name: manifest.name,
      notes,
      tree: manifest.tree,
    };
    const expectedFileNameByNoteId = new Map(
      createWorkspaceNoteFileLayout(workspace).map((entry) => [
        entry.note.id,
        entry.relativePath,
      ]),
    );

    for (const note of manifest.notes) {
      if (note.fileName !== expectedFileNameByNoteId.get(note.id)) {
        throw new Error(`Workspace note file path does not match tree: ${note.id}`);
      }
    }

    return workspace;
  }

  async saveWorkspace(workspace) {
    assertWorkspacePayloadDto(workspace);

    return this.#enqueueWrite(() => this.#saveWorkspace(workspace));
  }

  async #saveWorkspace(workspace) {
    await this.initialize();

    const noteFileLayout = createWorkspaceNoteFileLayout(workspace);
    const fileNameByNoteId = new Map(
      noteFileLayout.map((entry) => [entry.note.id, entry.relativePath]),
    );
    const expectedNoteFiles = new Set(
      noteFileLayout.map((entry) => entry.relativePath),
    );
    const manifest = {
      id: workspace.id,
      name: workspace.name,
      notes: workspace.notes.map((note) => {
        const fileName = fileNameByNoteId.get(note.id);

        if (!fileName) {
          throw new Error(`Workspace note is missing from tree: ${note.id}`);
        }

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

    for (const { note, relativePath } of noteFileLayout) {
      const filePath = path.join(this.#notesDir, ...relativePath.split("/"));

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFileAtomically(
        filePath,
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

  async readWorkspaceSyntaxSourceFile() {
    await this.initialize();

    return this.#readWorkspaceSyntaxSourceFile();
  }

  async saveWorkspaceSyntaxSource(source) {
    return this.#enqueueWrite(() => this.#saveWorkspaceSyntaxSource(source));
  }

  async #saveWorkspaceSyntaxSource(source) {
    await this.initialize();

    if (typeof source !== "string" || source.trim().length === 0) {
      throw new Error("Syntax profile source is empty");
    }

    await writeFileAtomically(
      path.join(this.#syntaxDir, workspaceSyntaxFileName),
      source,
    );
  }

  async #readWorkspaceSyntaxSourceFile() {
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
    const removeStaleEntries = async (directory, relativeSegments = []) => {
      let entries;

      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (error?.code === "ENOENT") {
          return false;
        }

        throw error;
      }

      await Promise.all(
        entries.map(async (entry) => {
          const entryPath = path.join(directory, entry.name);
          const entrySegments = [...relativeSegments, entry.name];
          const relativePath = entrySegments.join("/");

          if (entry.isDirectory()) {
            const isEmpty = await removeStaleEntries(entryPath, entrySegments);

            if (isEmpty) {
              await rm(entryPath, { force: true, recursive: true });
            }
            return;
          }

          if (entry.isFile() && entry.name.endsWith(".ctn") && !expectedNoteFiles.has(relativePath)) {
            await rm(entryPath);
          }
        }),
      );

      const nextEntries = await readdir(directory, { withFileTypes: true });
      return nextEntries.length === 0 && relativeSegments.length > 0;
    };

    await removeStaleEntries(this.#notesDir);
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
