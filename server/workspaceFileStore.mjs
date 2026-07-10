// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  removeAtomicWriteTemporaryFiles,
  writeFileAtomically,
} from "./atomicWrite.mjs";
import { WorkspaceCommitTransaction } from "./workspaceCommitTransaction.mjs";
import {
  assertWorkspaceManifestDto,
  assertWorkspacePayloadDto,
} from "./workspaceManifestDto.mjs";

const workspaceFileName = "workspace.json";
const notesDirName = "notes";
const syntaxDirName = "syntax";
const workspaceSyntaxFileName = "workspace.toml";

export class WorkspacePayloadValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkspacePayloadValidationError";
  }
}

function failPayloadValidation(message) {
  throw new WorkspacePayloadValidationError(message);
}

function assertSafePathSegment(segment, label) {
  if (
    typeof segment !== "string" ||
    segment.length === 0 ||
    segment.includes("/") ||
    segment.includes("\\") ||
    segment === "." ||
    segment === ".."
  ) {
    failPayloadValidation(`Unsafe ${label}: ${segment}`);
  }
}

function assertSafeRelativeFilePath(filePath, label) {
  if (
    typeof filePath !== "string" ||
    filePath.length === 0 ||
    filePath.startsWith("/") ||
    filePath.includes("\\")
  ) {
    failPayloadValidation(`Unsafe ${label}: ${filePath}`);
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
    failPayloadValidation(`Workspace note title does not match first line: ${note.id}`);
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
        failPayloadValidation(`Duplicate workspace file path: ${path.posix.join(...parentSegments, node.title)}`);
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
      failPayloadValidation(`Workspace note does not exist: ${node.noteId}`);
    }

    assertNoteTitleMatchesSource(note);

    if (usedNoteIds.has(note.id)) {
      failPayloadValidation(`Duplicate workspace note placement: ${note.id}`);
    }

    usedNoteIds.add(note.id);

    const fileName = noteFileName(note.title);

    if (siblingNames.has(fileName)) {
      failPayloadValidation(`Duplicate workspace file path: ${path.posix.join(...parentSegments, fileName)}`);
    }

    siblingNames.add(fileName);

    const relativePath = path.posix.join(...parentSegments, fileName);

    if (usedPaths.has(relativePath)) {
      failPayloadValidation(`Duplicate workspace file path: ${relativePath}`);
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
    failPayloadValidation(`Workspace note is missing from tree: ${missingNotes[0].id}`);
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
  #operationQueue = Promise.resolve();
  #initializePromise = null;
  #workspaceCommitTransaction;

  constructor(rootDir, { onWorkspaceCommitPhase = async () => {} } = {}) {
    this.#rootDir = path.resolve(rootDir);
    this.#workspaceCommitTransaction = new WorkspaceCommitTransaction(
      this.#rootDir,
      { onCommitPhase: onWorkspaceCommitPhase },
    );
  }

  async initialize() {
    if (!this.#initializePromise) {
      this.#initializePromise = this.#initialize();
    }

    try {
      await this.#initializePromise;
    } catch (error) {
      this.#initializePromise = null;
      throw error;
    }
  }

  get repositoryPath() {
    return this.#rootDir;
  }

  async loadWorkspace() {
    return this.#enqueueOperation(() => this.#loadWorkspace());
  }

  async #initialize() {
    await mkdir(this.#rootDir, { recursive: true });
    await mkdir(this.#syntaxDir, { recursive: true });
    await removeAtomicWriteTemporaryFiles(this.#rootDir);
    await this.#workspaceCommitTransaction.recover();
    await mkdir(this.#notesDir, { recursive: true });
  }

  async #loadWorkspace() {
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

    return this.#enqueueOperation(() => this.#saveWorkspace(workspace));
  }

  async #saveWorkspace(workspace) {
    try {
      await this.initialize();

      const noteFileLayout = createWorkspaceNoteFileLayout(workspace);
      const fileNameByNoteId = new Map(
        noteFileLayout.map((entry) => [entry.note.id, entry.relativePath]),
      );
      const manifest = {
        id: workspace.id,
        name: workspace.name,
        notes: workspace.notes.map((note) => {
          const fileName = fileNameByNoteId.get(note.id);

          if (!fileName) {
            failPayloadValidation(`Workspace note is missing from tree: ${note.id}`);
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

      await this.#workspaceCommitTransaction.commit({
        manifest,
        noteFiles: noteFileLayout.map(({ note, relativePath }) => ({
          relativePath,
          source: note.source,
        })),
      });
    } catch (error) {
      this.#initializePromise = null;
      throw error;
    }
  }

  async readWorkspaceSyntaxSourceFile() {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      return this.#readWorkspaceSyntaxSourceFile();
    });
  }

  async saveWorkspaceSyntaxSource(source) {
    return this.#enqueueOperation(() => this.#saveWorkspaceSyntaxSource(source));
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

  get #manifestPath() {
    return path.join(this.#rootDir, workspaceFileName);
  }

  get #notesDir() {
    return path.join(this.#rootDir, notesDirName);
  }

  get #syntaxDir() {
    return path.join(this.#rootDir, syntaxDirName);
  }

  #enqueueOperation(operation) {
    const result = this.#operationQueue.then(operation);

    this.#operationQueue = result.catch(() => undefined);
    return result;
  }
}
