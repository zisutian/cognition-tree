// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  parseWorkspaceRepositoryCommit,
} from "../contracts/workspace-repository/parseRepository.ts";
import type {
  RepositorySyntaxSourceDto,
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
  createEmptyRepositoryWorkspace,
  createRepositoryNoteFileName,
  createWorkspaceManifest,
  loadWorkspaceFromManifest,
  notesDirName,
  syntaxDirName,
  workspaceFileName,
} from "./workspaceRepositoryLayout.ts";
import { createWorkspaceRepositoryRevision } from "./workspaceRepositoryRevision.ts";
import { WorkspaceRevisionConflictError } from "./repositoryAdapter.ts";

export { WorkspacePayloadValidationError } from "./workspaceRepositoryLayout.ts";

type WorkspaceFileStoreOptions = {
  onWorkspaceCommitPhase?: (
    phase: WorkspaceCommitPhase,
  ) => Promise<void> | void;
};

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

  async #readWorkspace() {
    let manifest: unknown;

    try {
      manifest = await readJson(this.#manifestPath);
    } catch (error) {
      if (hasFileSystemErrorCode(error, "ENOENT")) {
        return createEmptyRepositoryWorkspace();
      }

      throw error;
    }

    return loadWorkspaceFromManifest(manifest, async (noteId) => {
      const fileName = createRepositoryNoteFileName(noteId);

      try {
        return await readFile(path.join(this.#notesDir, fileName), "utf8");
      } catch (error) {
        if (hasFileSystemErrorCode(error, "ENOENT")) {
          throw new Error(`Missing note source file: notes/${fileName}`);
        }

        throw error;
      }
    });
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
      revision: createWorkspaceRepositoryRevision(content),
    };
  }

  async #commitSnapshot({
    baseRevision,
    syntaxSourceFile,
    workspace,
  }: WorkspaceRepositoryCommitDto): Promise<WorkspaceRepositoryCommitResultDto> {
    await this.initialize();

    const currentContent = await this.#readSnapshotContent();
    const currentRevision = createWorkspaceRepositoryRevision(currentContent);

    if (currentRevision !== baseRevision) {
      throw new WorkspaceRevisionConflictError(currentRevision);
    }

    const manifest = createWorkspaceManifest(workspace);

    try {
      await this.#workspaceCommitTransaction.commit({
        manifest,
        noteFiles: workspace.notes.map((note) => ({
          relativePath: createRepositoryNoteFileName(note.id),
          source: note.source,
        })),
        syntaxSource: syntaxSourceFile?.source ?? null,
      });
    } catch (error) {
      this.#initializePromise = null;
      throw error;
    }

    return {
      revision: createWorkspaceRepositoryRevision({
        syntaxSourceFile,
        workspace,
      }),
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
