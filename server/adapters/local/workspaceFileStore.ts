// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "../../../contracts/workspace-repository/contractValue.ts";
import {
  parseWorkspaceRepositoryCommit,
  parseWorkspaceRepositoryContent,
} from "../../../contracts/workspace-repository/parseRepository.ts";
import {
  repositorySyntaxFileName,
  workspaceRepositorySchemaVersion,
  type RepositoryRevisionDto,
  type WorkspaceRepositoryCommitDto,
  type WorkspaceRepositoryCommitResultDto,
  type WorkspaceRepositoryContentDto,
  type WorkspaceRepositorySnapshotDto,
} from "../../../contracts/workspace-repository/types.ts";
import {
  parseRepositoryMetadata,
  type RepositoryMetadata,
} from "../../repository/repositoryMetadata.ts";
import {
  createRepositoryNoteFileName,
  loadWorkspaceFromSnapshot,
  notesDirName,
  repositoryMetadataFileName,
  snapshotsDirName,
  syntaxDirName,
  workspaceFileName,
  WorkspacePayloadValidationError,
} from "../../repository/workspaceRepositoryLayout.ts";
import { createWorkspaceRepositoryRevision } from "../../repository/workspaceRepositoryRevision.ts";
import {
  RepositoryCorruptError,
  WorkspaceRevisionConflictError,
} from "../../repository/repositoryStore.ts";
import {
  writeImmutableSnapshot,
  workspaceCommitPhases,
  type WorkspaceCommitPhase,
} from "./immutableSnapshotCommit.ts";
import {
  removeAtomicWriteTemporaryFiles,
  writeJsonAtomically,
} from "./atomicWrite.ts";
import { hasFileSystemErrorCode } from "./fileSystemError.ts";

type WorkspaceFileStoreOptions = {
  onWorkspaceCommitPhase?: (phase: WorkspaceCommitPhase) => Promise<void> | void;
};

async function readJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ENOENT")) {
      throw error;
    }
    throw new RepositoryCorruptError("Repository JSON is invalid");
  }
}

function mapStorageFailure(error: unknown): never {
  if (
    error instanceof RepositoryCorruptError ||
    error instanceof UnsupportedRepositoryVersionError
  ) {
    throw error;
  }
  if (
    error instanceof WorkspaceRepositoryContractError ||
    error instanceof WorkspacePayloadValidationError
  ) {
    throw new RepositoryCorruptError("Repository content is invalid");
  }
  if (hasFileSystemErrorCode(error, "ENOENT")) {
    throw new RepositoryCorruptError("Repository snapshot is incomplete");
  }
  throw error;
}

export async function createWorkspaceFileRepository({
  content: inputContent,
  label,
  rootDir: inputRootDir,
}: {
  content: WorkspaceRepositoryContentDto;
  label: string;
  rootDir: string;
}) {
  const rootDir = path.resolve(inputRootDir);
  const content = parseWorkspaceRepositoryContent(inputContent);
  const revision = createWorkspaceRepositoryRevision(content);

  await mkdir(path.join(rootDir, snapshotsDirName), { recursive: true });
  await writeImmutableSnapshot({ content, revision, rootDir });
  await writeJsonAtomically(path.join(rootDir, repositoryMetadataFileName), {
    currentRevision: revision,
    label,
    schemaVersion: workspaceRepositorySchemaVersion,
  });
  return revision;
}

export class WorkspaceFileStore {
  #initializePromise: Promise<void> | null = null;
  #onWorkspaceCommitPhase: NonNullable<WorkspaceFileStoreOptions["onWorkspaceCommitPhase"]>;
  #operationQueue: Promise<void> = Promise.resolve();
  #rootDir: string;

  constructor(
    rootDir: string,
    { onWorkspaceCommitPhase = async () => {} }: WorkspaceFileStoreOptions = {},
  ) {
    this.#rootDir = path.resolve(rootDir);
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

  async loadSnapshot(): Promise<WorkspaceRepositorySnapshotDto> {
    return this.#enqueueOperation(() => this.#loadSnapshot());
  }

  async commitSnapshot(value: unknown): Promise<WorkspaceRepositoryCommitResultDto> {
    const commit = parseWorkspaceRepositoryCommit(value);
    return this.#enqueueOperation(() => this.#commitSnapshot(commit));
  }

  async #initialize() {
    try {
      const metadata = await this.#readMetadata();

      await this.#readContent(metadata.currentRevision);
      await removeAtomicWriteTemporaryFiles(this.#rootDir);
      await this.#cleanupUnreferencedSnapshots(metadata.currentRevision);
    } catch (error) {
      if (hasFileSystemErrorCode(error, "ENOENT")) {
        try {
          await readFile(path.join(this.#rootDir, workspaceFileName), "utf8");
          throw new UnsupportedRepositoryVersionError("$.schemaVersion", 2);
        } catch (legacyError) {
          if (legacyError instanceof UnsupportedRepositoryVersionError) {
            throw legacyError;
          }
          throw new RepositoryCorruptError("Repository head is missing");
        }
      }
      mapStorageFailure(error);
    }
  }

  async #loadSnapshot(): Promise<WorkspaceRepositorySnapshotDto> {
    await this.initialize();
    try {
      const metadata = await this.#readMetadata();
      const content = await this.#readContent(metadata.currentRevision);

      return { content, revision: metadata.currentRevision };
    } catch (error) {
      mapStorageFailure(error);
    }
  }

  async #commitSnapshot(
    commit: WorkspaceRepositoryCommitDto,
  ): Promise<WorkspaceRepositoryCommitResultDto> {
    await this.initialize();
    let metadata: RepositoryMetadata;

    try {
      metadata = await this.#readMetadata();
    } catch (error) {
      mapStorageFailure(error);
    }

    if (metadata.currentRevision !== commit.baseRevision) {
      throw new WorkspaceRevisionConflictError(metadata.currentRevision);
    }

    // Validate the current generation before publishing from its revision.
    await this.#readContent(metadata.currentRevision);
    const revision = createWorkspaceRepositoryRevision(commit.content);

    if (revision === metadata.currentRevision) {
      return { revision };
    }

    try {
      await writeImmutableSnapshot({
        content: commit.content,
        onPhase: this.#onWorkspaceCommitPhase,
        revision,
        rootDir: this.#rootDir,
      });
      await writeJsonAtomically(this.#metadataPath, {
        currentRevision: revision,
        label: metadata.label,
        schemaVersion: workspaceRepositorySchemaVersion,
      });
      // The durable head replacement above is the sole commit point. Cleanup and
      // observability callbacks must never turn an already committed write into a
      // reported failure; startup will remove anything left behind.
      await Promise.resolve()
        .then(() => this.#onWorkspaceCommitPhase(workspaceCommitPhases.headCommitted))
        .catch(() => undefined);
      const cleaned = await this.#cleanupUnreferencedSnapshots(revision)
        .then(() => true, () => false);

      if (cleaned) {
        await Promise.resolve()
          .then(() => this.#onWorkspaceCommitPhase(workspaceCommitPhases.cleanupCompleted))
          .catch(() => undefined);
      }
      return { revision };
    } catch (error) {
      this.#initializePromise = null;
      if (hasFileSystemErrorCode(error, "ENOSPC") || hasFileSystemErrorCode(error, "EDQUOT")) {
        throw error;
      }
      throw error;
    }
  }

  async #readMetadata(): Promise<RepositoryMetadata> {
    return parseRepositoryMetadata(await readJson(this.#metadataPath));
  }

  async #readContent(revision: RepositoryRevisionDto): Promise<WorkspaceRepositoryContentDto> {
    try {
      const snapshotDir = path.join(this.#snapshotsDir, revision);
      const workspace = await loadWorkspaceFromSnapshot(
        await readJson(path.join(snapshotDir, workspaceFileName)),
        async (noteId) => readFile(
          path.join(snapshotDir, notesDirName, createRepositoryNoteFileName(noteId)),
          "utf8",
        ),
      );
      const syntaxSource = await readFile(
        path.join(snapshotDir, syntaxDirName, repositorySyntaxFileName),
        "utf8",
      ).catch((error: unknown) => {
        if (hasFileSystemErrorCode(error, "ENOENT")) {
          return null;
        }
        throw error;
      });
      const content = parseWorkspaceRepositoryContent({
        schemaVersion: workspaceRepositorySchemaVersion,
        syntaxSource,
        workspace,
      });
      const actualRevision = createWorkspaceRepositoryRevision(content);

      if (actualRevision !== revision) {
        throw new RepositoryCorruptError("Repository snapshot hash does not match its revision");
      }
      return content;
    } catch (error) {
      mapStorageFailure(error);
    }
  }

  async #cleanupUnreferencedSnapshots(currentRevision: RepositoryRevisionDto) {
    const entries = await readdir(this.#snapshotsDir, { withFileTypes: true });

    await Promise.all(entries.map(async (entry) => {
      if (entry.name !== currentRevision) {
        await rm(path.join(this.#snapshotsDir, entry.name), {
          force: true,
          recursive: true,
        });
      }
    }));
  }

  get #metadataPath() {
    return path.join(this.#rootDir, repositoryMetadataFileName);
  }

  get #snapshotsDir() {
    return path.join(this.#rootDir, snapshotsDirName);
  }

  #enqueueOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#operationQueue.then(operation);
    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
