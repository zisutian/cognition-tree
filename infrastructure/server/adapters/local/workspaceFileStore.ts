// SPDX-License-Identifier: GPL-3.0-or-later

import {
  lstat,
  mkdir,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import {
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "../../../../contracts/workspace/contractValue.ts";
import {
  parseWorkspaceRepositoryContent,
} from "../../../../contracts/workspace/parseRepository.ts";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import type {
  WorkspaceRepositoryCommitDto,
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/types.ts";
import {
  prepareWorkspaceRepositoryContent,
  type WorkspaceRepositoryPreparation,
} from "../../../../application/repository/workspaceRepositoryPreparation.ts";
import { repositorySyntaxIndexFileName } from "../../../../contracts/workspace/types.ts";
import { parsePortableName } from "../../../../core/naming/portableName.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
  WorkspaceRevisionConflictError,
  type PreparedWorkspaceRepositorySnapshot,
  type WorkspaceRepositoryCommitReceipt,
  type WorkspaceRepositoryStore,
} from "../../repository/store.ts";
import { hasFileSystemErrorCode } from "../../persistence/fileSystemError.ts";
import {
  createRepositorySyntaxFileName,
  loadSyntaxFromSnapshot,
} from "../../repository/workspace/layout.ts";
import {
  fsyncDirectory,
  removeDurableWriteTemporaryFiles,
  replaceFileDurably,
} from "../../persistence/fileSystemPersistence.ts";
import type {
  WorkspaceCommitPhase,
} from "./workingTreeTransaction.ts";
import { createLocalProjectionFromContent } from "./localCanonicalProjection.ts";
import {
  createLocalProjectionFromWorkingTree,
  readLocalControlText,
  readLocalJson,
} from "./localWorkingTree.ts";
import {
  parseLocalNoteMetadata,
  parseLocalRepositoryIndex,
  parseLocalRepositoryMetadata,
} from "./localWorkingTreeCodec.ts";
import {
  localControlDirectoryName,
  localIndexFileName,
  localNoteMetadataDirectoryName,
  localRepositoryMetadataFileName,
  localSyntaxDirectoryName,
  localTransactionsDirectoryName,
  type LocalNoteMetadata,
  type LocalRepositoryIndex,
  type LocalRepositoryMetadata,
  type LocalWorkingTreeProjection,
} from "./localWorkingTreeLayout.ts";
import {
  commitLocalWorkingTreeTransaction,
} from "./workingTreeTransaction.ts";
import {
  recoverLocalWorkingTreeTransactions,
} from "./workingTreeTransactionRecovery.ts";
import {
  captureLocalManagedWorkingTreeState,
  equalLocalManagedWorkingTreeState,
  localWorkingTreeMatchesTarget,
  targetDirectoriesFromFilesAndIndex,
} from "./workingTreeTransactionState.ts";

type WorkspaceFileStoreOptions = {
  createBlockId: () => string;
  createFolderId: () => string;
  createNoteId: () => string;
  now: () => string;
  onWorkspaceCommitPhase?: (phase: WorkspaceCommitPhase) => Promise<void> | void;
};

function prepareWorkspaceWriteContent(
  content: WorkspaceRepositoryContentDto,
  previous?: WorkspaceRepositoryPreparation | null,
) {
  try {
    return prepareWorkspaceRepositoryContent(content, { previous });
  } catch (error) {
    throw new WorkspaceRepositoryContractError(
      "$.content",
      error instanceof Error ? error.message : "invalid workspace content",
    );
  }
}

function mapPersistedFailure(error: unknown): never {
  if (
    error instanceof RepositoryAdapterError ||
    error instanceof RepositoryCorruptError ||
    error instanceof UnsupportedRepositoryVersionError
  ) {
    throw error;
  }
  if (error instanceof WorkspaceRepositoryContractError) {
    throw new RepositoryCorruptError("Local repository control data is invalid");
  }
  if (hasFileSystemErrorCode(error, "ENOENT")) {
    throw new RepositoryCorruptError("Local repository control data is incomplete");
  }
  throw error;
}

async function ensureSafeDirectory(directory: string) {
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new RepositoryCorruptError("Local repository directory is invalid");
  }
}

async function ensureProjectionDirectories(
  rootDir: string,
  projection: LocalWorkingTreeProjection,
) {
  const folderPaths = projection.index.entries
    .filter((entry) => entry.kind === "folder")
    .map((entry) => entry.path)
    .sort((left, right) => left.split("/").length - right.split("/").length);
  for (const relativePath of folderPaths) {
    await mkdir(path.join(rootDir, ...relativePath.split("/")), {
      mode: 0o700,
      recursive: true,
    });
  }
}

async function writeInitialProjection(
  rootDir: string,
  projection: LocalWorkingTreeProjection,
) {
  await mkdir(path.join(rootDir, localControlDirectoryName), {
    mode: 0o700,
    recursive: true,
  });
  await mkdir(
    path.join(rootDir, localControlDirectoryName, localNoteMetadataDirectoryName),
    { mode: 0o700, recursive: true },
  );
  await mkdir(
    path.join(rootDir, localControlDirectoryName, localTransactionsDirectoryName),
    { mode: 0o700, recursive: true },
  );
  await ensureProjectionDirectories(rootDir, projection);
  const headPath = `${localControlDirectoryName}/${localRepositoryMetadataFileName}`;
  for (const [relativePath, source] of projection.files) {
    if (relativePath === headPath) continue;
    const filePath = path.join(rootDir, ...relativePath.split("/"));
    await mkdir(path.dirname(filePath), { mode: 0o700, recursive: true });
    await replaceFileDurably(filePath, source);
  }
  await replaceFileDurably(
    path.join(rootDir, ...headPath.split("/")),
    projection.files.get(headPath) ?? "",
  );
  await fsyncDirectory(path.join(rootDir, localControlDirectoryName));
  await fsyncDirectory(rootDir);
}

export async function createWorkspaceFileRepository({
  content: inputContent,
  label,
  repositoryId,
  rootDir: inputRootDir,
}: {
  content: WorkspaceRepositoryContentDto;
  label: string;
  repositoryId: string;
  rootDir: string;
}) {
  const rootDir = path.resolve(inputRootDir);
  const content = parseWorkspaceRepositoryContent(inputContent);
  const preparation = prepareWorkspaceWriteContent(content);
  const parsedLabel = parsePortableName(label, "Repository label");
  const projection = createLocalProjectionFromContent({
    content,
    label: parsedLabel,
    preparation,
    repositoryId,
    rootDir,
  });

  await mkdir(rootDir, { mode: 0o700, recursive: true });
  const existing = await readdir(rootDir);
  if (existing.length > 0) {
    throw new RepositoryAdapterError("invalid_request", "Local repository target is not empty");
  }
  await writeInitialProjection(rootDir, projection);
  return projection.revision;
}

export class WorkspaceFileStore implements WorkspaceRepositoryStore {
  #acceptingOperations = true;
  #closeForDeletionPromise: Promise<void> | null = null;
  #createBlockId: () => string;
  #createFolderId: () => string;
  #createNoteId: () => string;
  #initializePromise: Promise<void> | null = null;
  #lastPreparedSnapshot: PreparedWorkspaceRepositorySnapshot | null = null;
  #now: () => string;
  #onWorkspaceCommitPhase: NonNullable<WorkspaceFileStoreOptions["onWorkspaceCommitPhase"]>;
  #operationQueue: Promise<void> = Promise.resolve();
  #rootDir: string;

  constructor(
    rootDir: string,
    {
      createBlockId,
      createFolderId,
      createNoteId,
      now,
      onWorkspaceCommitPhase = async () => {},
    }: WorkspaceFileStoreOptions,
  ) {
    this.#rootDir = path.resolve(rootDir);
    this.#createBlockId = createBlockId;
    this.#createFolderId = createFolderId;
    this.#createNoteId = createNoteId;
    this.#now = now;
    this.#onWorkspaceCommitPhase = onWorkspaceCommitPhase;
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

  async loadSnapshot(): Promise<PreparedWorkspaceRepositorySnapshot> {
    this.#assertAcceptingOperations();
    return this.#enqueueOperation(() => this.#loadSnapshot());
  }

  async commitSnapshot(
    commit: WorkspaceRepositoryCommitDto,
  ): Promise<WorkspaceRepositoryCommitReceipt> {
    this.#assertAcceptingOperations();
    return this.#enqueueOperation(() => this.#commitSnapshot(commit, null));
  }

  async commitPreparedSnapshot(
    commit: WorkspaceRepositoryCommitDto,
    preparation: WorkspaceRepositoryPreparation,
  ): Promise<WorkspaceRepositoryCommitReceipt> {
    this.#assertAcceptingOperations();
    return this.#enqueueOperation(() =>
      this.#commitSnapshot(commit, preparation)
    );
  }

  async renameLabel(label: string) {
    this.#assertAcceptingOperations();
    const parsedLabel = parsePortableName(label, "Repository label");
    return this.#enqueueOperation(async () => {
      await this.initialize();
      const metadata = await this.#readMetadata();
      if (metadata.label === parsedLabel) return;
      await replaceFileDurably(
        path.join(
          this.#rootDir,
          localControlDirectoryName,
          localRepositoryMetadataFileName,
        ),
        `${serializeJsonIteratively({ ...metadata, label: parsedLabel }, { indent: 2 })}\n`,
      );
    });
  }

  closeForDeletion(): Promise<void> {
    if (!this.#closeForDeletionPromise) {
      this.#acceptingOperations = false;
      this.#closeForDeletionPromise = this.#operationQueue.then(() => undefined);
    }
    return this.#closeForDeletionPromise;
  }

  async #initialize() {
    try {
      await ensureSafeDirectory(this.#rootDir);
      const controlPath = path.join(this.#rootDir, localControlDirectoryName);
      await ensureSafeDirectory(controlPath);
      await ensureSafeDirectory(path.join(controlPath, localNoteMetadataDirectoryName));
      await ensureSafeDirectory(path.join(controlPath, localSyntaxDirectoryName));
      await ensureSafeDirectory(path.join(controlPath, localTransactionsDirectoryName));
      await recoverLocalWorkingTreeTransactions(this.#rootDir);
      await removeDurableWriteTemporaryFiles(this.#rootDir);
      await this.#assertControlLayout();
      this.#prepareSnapshot(await this.#scanAndSynchronize());
    } catch (error) {
      mapPersistedFailure(error);
    }
  }

  async #loadSnapshot(): Promise<PreparedWorkspaceRepositorySnapshot> {
    await this.initialize();
    try {
      return this.#prepareSnapshot(await this.#scanAndSynchronize());
    } catch (error) {
      mapPersistedFailure(error);
    }
  }

  async #commitSnapshot(
    commit: WorkspaceRepositoryCommitDto,
    prepared: WorkspaceRepositoryPreparation | null,
  ): Promise<WorkspaceRepositoryCommitReceipt> {
    await this.initialize();
    let current: LocalWorkingTreeProjection;
    try {
      current = await this.#scanAndSynchronize();
    } catch (error) {
      mapPersistedFailure(error);
    }
    if (current.revision !== commit.baseRevision) {
      throw new WorkspaceRevisionConflictError(current.revision);
    }
    const before = this.#prepareSnapshot(current);
    const preparation = prepared ?? prepareWorkspaceWriteContent(
      commit.content,
      before.projection,
    );
    let target: LocalWorkingTreeProjection;
    try {
      target = createLocalProjectionFromContent({
        content: commit.content,
        label: current.metadata.label,
        preparation,
        previousIndex: current.index,
        repositoryId: current.metadata.repositoryId,
        rootDir: this.#rootDir,
      });
    } catch (error) {
      if (error instanceof RepositoryCorruptError) {
        throw new WorkspaceRepositoryContractError(
          "$.content.workspace.notes",
          error.message,
        );
      }
      throw error;
    }
    if (target.revision === current.revision) {
      return {
        after: before,
        before,
        revision: target.revision,
      };
    }
    const targetDirectories = targetDirectoriesFromFilesAndIndex(
      target.files,
      target.index.entries
        .filter((entry) => entry.kind === "folder")
        .map((entry) => entry.path),
    );
    await commitLocalWorkingTreeTransaction({
      baseRevision: current.revision,
      expectedCurrentState: {
        directories: new Set(targetDirectoriesFromFilesAndIndex(
          current.files,
          current.index.entries
            .filter((entry) => entry.kind === "folder")
            .map((entry) => entry.path),
        )),
        files: current.files,
      },
      onPhase: this.#onWorkspaceCommitPhase,
      rootDir: this.#rootDir,
      targetDirectories,
      targetFiles: target.files,
      targetRevision: target.revision,
    });
    const after = {
      content: commit.content,
      projection: preparation,
      revision: target.revision,
    };

    this.#lastPreparedSnapshot = after;
    return { after, before, revision: target.revision };
  }

  #prepareSnapshot(
    projection: LocalWorkingTreeProjection,
  ): PreparedWorkspaceRepositorySnapshot {
    if (this.#lastPreparedSnapshot?.revision === projection.revision) {
      return this.#lastPreparedSnapshot;
    }
    try {
      const snapshot = {
        content: projection.content,
        projection: prepareWorkspaceRepositoryContent(projection.content, {
          analysisOverrides: projection.analysisOverrides,
          previous: this.#lastPreparedSnapshot?.projection,
          syntaxOverrides: projection.syntaxOverrides,
        }),
        revision: projection.revision,
      };

      this.#lastPreparedSnapshot = snapshot;
      return snapshot;
    } catch {
      throw new RepositoryCorruptError("Local repository content is invalid");
    }
  }

  async #scanAndSynchronize() {
    const observedBefore = await captureLocalManagedWorkingTreeState(this.#rootDir);
    const metadata = await this.#readMetadata();
    const index = await this.#readIndex();
    if (metadata.repositoryId !== path.basename(this.#rootDir)) {
      throw new RepositoryCorruptError("Local repository identity does not match its directory");
    }
    const syntax = await this.#readSyntax();
    const projection = await createLocalProjectionFromWorkingTree({
      createBlockId: this.#createBlockId,
      createFolderId: this.#createFolderId,
      createNoteId: this.#createNoteId,
      index,
      metadata,
      previousPreparation: this.#lastPreparedSnapshot?.projection,
      readNoteMetadata: (noteId) => this.#readNoteMetadata(noteId),
      rootDir: this.#rootDir,
      syntax,
      timestamp: this.#now(),
    });
    const observedAfter = await captureLocalManagedWorkingTreeState(this.#rootDir);
    if (!equalLocalManagedWorkingTreeState(observedBefore, observedAfter)) {
      throw new RepositoryAdapterError(
        "repository_busy",
        "Local repository changed while it was being reconciled",
      );
    }
    const targetDirectories = targetDirectoriesFromFilesAndIndex(
      projection.files,
      projection.index.entries
        .filter((entry) => entry.kind === "folder")
        .map((entry) => entry.path),
    );
    if (!(await localWorkingTreeMatchesTarget(
      this.#rootDir,
      projection.files,
      targetDirectories,
    ))) {
      await commitLocalWorkingTreeTransaction({
        baseRevision: metadata.currentRevision,
        expectedCurrentState: observedAfter,
        rootDir: this.#rootDir,
        targetDirectories,
        targetFiles: projection.files,
        targetRevision: projection.revision,
      });
    }
    return projection;
  }

  async #readMetadata(): Promise<LocalRepositoryMetadata> {
    return parseLocalRepositoryMetadata(await readLocalJson(
      path.join(
        this.#rootDir,
        localControlDirectoryName,
        localRepositoryMetadataFileName,
      ),
    ));
  }

  async #readIndex(): Promise<LocalRepositoryIndex> {
    return parseLocalRepositoryIndex(await readLocalJson(
      path.join(this.#rootDir, localControlDirectoryName, localIndexFileName),
    ));
  }

  async #readSyntax() {
    const syntaxDirectory = path.join(
      this.#rootDir,
      localControlDirectoryName,
      localSyntaxDirectoryName,
    );
    const syntax = await loadSyntaxFromSnapshot(
      await readLocalJson(path.join(syntaxDirectory, repositorySyntaxIndexFileName)),
      (syntaxFileId) => readLocalControlText(
        path.join(syntaxDirectory, createRepositorySyntaxFileName(syntaxFileId)),
      ),
    );
    const expected = new Set([
      repositorySyntaxIndexFileName,
      ...syntax.files.map((file) => createRepositorySyntaxFileName(file.id)),
    ]);
    const entries = await readdir(syntaxDirectory, { withFileTypes: true });
    if (
      entries.length !== expected.size ||
      entries.some((entry) =>
        !expected.has(entry.name) || !entry.isFile() || entry.isSymbolicLink()
      )
    ) {
      throw new RepositoryCorruptError("Local syntax directory contains an unknown entry");
    }
    return syntax;
  }

  async #readNoteMetadata(noteId: string): Promise<LocalNoteMetadata | null> {
    const filePath = path.join(
      this.#rootDir,
      localControlDirectoryName,
      localNoteMetadataDirectoryName,
      `${noteId}.json`,
    );
    const value = await readLocalJson(filePath).catch((error: unknown) => {
      if (hasFileSystemErrorCode(error, "ENOENT")) return null;
      throw error;
    });
    return value === null ? null : parseLocalNoteMetadata(value, noteId);
  }

  async #assertControlLayout() {
    const controlPath = path.join(this.#rootDir, localControlDirectoryName);
    const allowed = new Set([
      localIndexFileName,
      localNoteMetadataDirectoryName,
      localRepositoryMetadataFileName,
      localSyntaxDirectoryName,
      localTransactionsDirectoryName,
    ]);
    const entries = await readdir(controlPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!allowed.has(entry.name) || entry.isSymbolicLink()) {
        throw new RepositoryCorruptError("Local control directory contains an unknown entry");
      }
    }
    const metadataEntries = await readdir(
      path.join(controlPath, localNoteMetadataDirectoryName),
      { withFileTypes: true },
    );
    for (const entry of metadataEntries) {
      if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) {
        throw new RepositoryCorruptError("Local note metadata directory is invalid");
      }
    }
    const syntaxEntries = await readdir(
      path.join(controlPath, localSyntaxDirectoryName),
      { withFileTypes: true },
    );
    for (const entry of syntaxEntries) {
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new RepositoryCorruptError("Local syntax directory is invalid");
      }
    }
  }

  #assertAcceptingOperations() {
    if (!this.#acceptingOperations) {
      throw new RepositoryAdapterError(
        "repository_not_found",
        "Repository is being deleted",
      );
    }
  }

  #enqueueOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#operationQueue.then(operation);
    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
