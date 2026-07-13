// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  parseWorkspaceRepositoryCommit,
} from "../contracts/workspace-repository/parseRepository.ts";
import { serializeWorkspaceRepositoryRevisionContent } from "../contracts/workspace-repository/revision.ts";
import type {
  RepositoryNoteDto,
  RepositorySyntaxSourceDto,
  RepositoryWorkspaceDto,
  WorkspaceRepositoryCommitDto,
  WorkspaceRepositoryContentDto,
  WorkspaceRepositoryCommitResultDto,
  WorkspaceRepositorySnapshotDto,
} from "../contracts/workspace-repository/types.ts";
import { repositorySyntaxFileName } from "../contracts/workspace-repository/types.ts";
import { removeAtomicWriteTemporaryFiles } from "./atomicWrite.ts";
import { hasFileSystemErrorCode } from "./fileSystemError.ts";
import {
  WorkspaceCommitTransaction,
  type WorkspaceCommitPhase,
} from "./workspaceCommitTransaction.ts";
import {
  parseWorkspaceManifest,
  type WorkspaceManifest,
} from "./workspaceManifest.ts";

const workspaceFileName = "workspace.json";
const notesDirName = "notes";
const syntaxDirName = "syntax";
export class WorkspacePayloadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspacePayloadValidationError";
  }
}

export class WorkspaceRevisionConflictError extends Error {
  currentRevision: string;

  constructor(currentRevision: string) {
    super("Repository content changed outside the current session");
    this.name = "WorkspaceRevisionConflictError";
    this.currentRevision = currentRevision;
  }
}

function failPayloadValidation(message: string): never {
  throw new WorkspacePayloadValidationError(message);
}

function assertSafePathSegment(segment: unknown, label: string): asserts segment is string {
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

function noteFileName(noteTitle: string) {
  assertSafePathSegment(noteTitle, "note title");
  return `${noteTitle}.ctn`;
}

function inferNoteTitle(source: string) {
  return source.split("\n")[0]?.trim() ?? "";
}

function assertNoteTitleMatchesSource(note: RepositoryNoteDto) {
  const sourceTitle = inferNoteTitle(note.source);

  if (note.title !== sourceTitle) {
    failPayloadValidation(`Workspace note title does not match first line: ${note.id}`);
  }
}

function createNoteById(notes: RepositoryNoteDto[]) {
  return new Map(notes.map((note) => [note.id, note]));
}

type NoteFileLayoutEntry = {
  note: RepositoryNoteDto;
  relativePath: string;
};

type NoteFileLayoutInput = {
  noteById: ReadonlyMap<string, RepositoryNoteDto>;
  nodes: RepositoryWorkspaceDto["tree"];
  parentSegments?: string[];
  usedNoteIds?: Set<string>;
  usedPaths?: Set<string>;
};

type WorkspaceFileStoreOptions = {
  onWorkspaceCommitPhase?: (
    phase: WorkspaceCommitPhase,
  ) => Promise<void> | void;
};

function createNoteFileLayout({
  noteById,
  nodes,
  parentSegments = [],
  usedNoteIds = new Set(),
  usedPaths = new Set(),
}: NoteFileLayoutInput): NoteFileLayoutEntry[] {
  const entries: NoteFileLayoutEntry[] = [];
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

function createWorkspaceNoteFileLayout(
  workspace: RepositoryWorkspaceDto,
): NoteFileLayoutEntry[] {
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

function createEmptyWorkspace(): RepositoryWorkspaceDto {
  return {
    id: "local-workspace",
    name: "本地笔记库",
    notes: [],
    tree: [],
  };
}

function createRepositoryRevision({
  syntaxSourceFile,
  workspace,
}: WorkspaceRepositoryContentDto) {
  return createHash("sha256")
    .update(
      serializeWorkspaceRepositoryRevisionContent({
        syntaxSourceFile,
        workspace,
      }),
    )
    .digest("hex");
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export class WorkspaceFileStore {
  #rootDir: string;
  #operationQueue: Promise<void> = Promise.resolve();
  #initializePromise: Promise<void> | null = null;
  #workspaceCommitTransaction: WorkspaceCommitTransaction;

  constructor(
    rootDir: string,
    {
      onWorkspaceCommitPhase = async () => {},
    }: WorkspaceFileStoreOptions = {},
  ) {
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

  async loadSnapshot(): Promise<WorkspaceRepositorySnapshotDto> {
    return this.#enqueueOperation(() => this.#loadSnapshot());
  }

  async commitSnapshot(
    value: unknown,
  ): Promise<WorkspaceRepositoryCommitResultDto> {
    const commit = parseWorkspaceRepositoryCommit(value);
    const { baseRevision, syntaxSourceFile, workspace } = commit;

    return this.#enqueueOperation(() =>
      this.#commitSnapshot({ baseRevision, syntaxSourceFile, workspace }),
    );
  }

  async #initialize() {
    await mkdir(this.#rootDir, { recursive: true });
    await removeAtomicWriteTemporaryFiles(this.#rootDir);
    await this.#workspaceCommitTransaction.recover();
    await mkdir(this.#notesDir, { recursive: true });
    await mkdir(this.#syntaxDir, { recursive: true });
  }

  async #readWorkspace(): Promise<RepositoryWorkspaceDto> {
    let manifest: unknown;

    try {
      manifest = await readJson(this.#manifestPath);
    } catch (error) {
      if (hasFileSystemErrorCode(error, "ENOENT")) {
        return createEmptyWorkspace();
      }

      throw error;
    }

    const parsedManifest = parseWorkspaceManifest(manifest);

    const notes: RepositoryNoteDto[] = [];

    for (const note of parsedManifest.notes) {
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
        if (hasFileSystemErrorCode(error, "ENOENT")) {
          throw new Error(`Missing note source file: ${note.fileName}`);
        }

        throw error;
      }
    }

    const workspace = {
      id: parsedManifest.id,
      name: parsedManifest.name,
      notes,
      tree: parsedManifest.tree,
    };
    const expectedFileNameByNoteId = new Map(
      createWorkspaceNoteFileLayout(workspace).map((entry) => [
        entry.note.id,
        entry.relativePath,
      ]),
    );

    for (const note of parsedManifest.notes) {
      if (note.fileName !== expectedFileNameByNoteId.get(note.id)) {
        throw new Error(`Workspace note file path does not match tree: ${note.id}`);
      }
    }

    return workspace;
  }

  async #readSnapshotContent(): Promise<WorkspaceRepositoryContentDto> {
    return {
      syntaxSourceFile: await this.#readSyntaxSourceFile(),
      workspace: await this.#readWorkspace(),
    };
  }

  async #loadSnapshot(): Promise<WorkspaceRepositorySnapshotDto> {
    await this.initialize();

    const content = await this.#readSnapshotContent();

    return {
      ...content,
      repositoryPath: this.#rootDir,
      revision: createRepositoryRevision(content),
    };
  }

  async #commitSnapshot({
    baseRevision,
    syntaxSourceFile,
    workspace,
  }: WorkspaceRepositoryCommitDto): Promise<WorkspaceRepositoryCommitResultDto> {
    await this.initialize();

    const currentContent = await this.#readSnapshotContent();
    const currentRevision = createRepositoryRevision(currentContent);

    if (currentRevision !== baseRevision) {
      throw new WorkspaceRevisionConflictError(currentRevision);
    }

    const noteFileLayout = createWorkspaceNoteFileLayout(workspace);
    const fileNameByNoteId = new Map(
      noteFileLayout.map((entry) => [entry.note.id, entry.relativePath]),
    );
    const manifest: WorkspaceManifest = {
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

    try {
      await this.#workspaceCommitTransaction.commit({
        manifest,
        noteFiles: noteFileLayout.map(({ note, relativePath }) => ({
          relativePath,
          source: note.source,
        })),
        syntaxSource: syntaxSourceFile?.source ?? null,
      });
    } catch (error) {
      this.#initializePromise = null;
      throw error;
    }

    return {
      revision: createRepositoryRevision({ syntaxSourceFile, workspace }),
    };
  }

  async #readSyntaxSourceFile(): Promise<RepositorySyntaxSourceDto | null> {
    let source: string;

    try {
      source = await readFile(
        path.join(this.#syntaxDir, repositorySyntaxFileName),
        "utf8",
      );
    } catch (error) {
      if (hasFileSystemErrorCode(error, "ENOENT")) {
        return null;
      }

      throw error;
    }

    return {
      fileName: repositorySyntaxFileName,
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

  #enqueueOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#operationQueue.then(operation);

    this.#operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
