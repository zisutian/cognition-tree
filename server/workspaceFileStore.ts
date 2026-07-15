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
  isSafeWorkspaceNoteId,
  parseWorkspaceManifest,
  workspaceManifestSchemaVersion,
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

function noteFileName(noteId: string) {
  if (!isSafeWorkspaceNoteId(noteId)) {
    failPayloadValidation(`Unsafe note id: ${noteId}`);
  }

  return `${noteId}.ctn`;
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

type NoteFileLayoutEntry = {
  note: RepositoryNoteDto;
  relativePath: string;
};

type WorkspaceFileStoreOptions = {
  onWorkspaceCommitPhase?: (
    phase: WorkspaceCommitPhase,
  ) => Promise<void> | void;
};

function createWorkspaceNoteFileLayout(
  workspace: RepositoryWorkspaceDto,
): NoteFileLayoutEntry[] {
  workspace.notes.forEach(assertNoteTitleMatchesSource);
  return workspace.notes.map((note) => ({
    note,
    relativePath: noteFileName(note.id),
  }));
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
      const fileName = noteFileName(note.id);

      try {
        const source = await readFile(
          path.join(this.#notesDir, fileName),
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
          throw new Error(`Missing note source file: notes/${fileName}`);
        }

        throw error;
      }
    }

    return {
      id: parsedManifest.id,
      name: parsedManifest.name,
      notes,
      tree: parsedManifest.tree,
    };
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
    const manifest: WorkspaceManifest = {
      id: workspace.id,
      name: workspace.name,
      notes: workspace.notes.map((note) => ({
        id: note.id,
        title: note.title,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      })),
      schemaVersion: workspaceManifestSchemaVersion,
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
