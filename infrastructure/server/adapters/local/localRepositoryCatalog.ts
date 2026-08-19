// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import { isRepositoryId } from "../../../../contracts/workspace/parseCatalog.ts";
import { parsePortableName } from "../../../../core/naming/portableName.ts";
import {
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "../../../../contracts/workspace/contractValue.ts";
import type {
  RepositoryCatalogDto,
  RepositoryCatalogIssueDto,
  RepositoryDescriptorDto,
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/types.ts";
import {
  RepositoryCatalogError,
} from "../../repository/catalog.ts";
import { RepositoryCorruptError } from "../../repository/store.ts";
import { fsyncDirectory } from "../../persistence/fileSystemPersistence.ts";
import { hasFileSystemErrorCode } from "../../persistence/fileSystemError.ts";
import {
  createWorkspaceFileRepository,
  WorkspaceFileStore,
} from "./workspaceFileStore.ts";
import { readLocalJson } from "./localWorkingTree.ts";
import { parseLocalRepositoryMetadata } from "./localWorkingTreeCodec.ts";
import { assertLocalRepositoryContainsOnlyManagedData } from "./localManagedDataGuard.ts";
import {
  localControlDirectoryName,
  localRepositoryMetadataFileName,
} from "./localWorkingTreeLayout.ts";

const writerLockFileName = ".ctn-writer.lock";
const catalogCreateStagingPattern =
  /^\.create-.+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const repositoryDeletionTombstonePattern =
  /^\.delete-.+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const localRepositoryDeletionPhases = {
  cleanupCompleted: "cleanup-completed",
  deletionCommitted: "deletion-committed",
  tombstoneRenamed: "tombstone-renamed",
} as const;

export type LocalRepositoryDeletionPhase =
  typeof localRepositoryDeletionPhases[keyof typeof localRepositoryDeletionPhases];

type LocalRepositoryCatalogOptions = {
  createStore?: (rootDir: string) => WorkspaceFileStore;
  hostRoot?: string | null;
  onRepositoryDeletionPhase?: (
    phase: LocalRepositoryDeletionPhase,
  ) => Promise<void> | void;
};

export type CreateLocalRepositoryWithId = {
  content: WorkspaceRepositoryContentDto;
  id: string;
  label: string;
};

async function pathExists(filePath: string) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

export class LocalRepositoryCatalog {
  #createStore: NonNullable<LocalRepositoryCatalogOptions["createStore"]>;
  #initializePromise: Promise<void> | null = null;
  #hostRoot: string | null;
  #lockCompromised = false;
  #onRepositoryDeletionPhase: NonNullable<
    LocalRepositoryCatalogOptions["onRepositoryDeletionPhase"]
  >;
  #operationQueue: Promise<void> = Promise.resolve();
  #releaseWriterLock: (() => Promise<void>) | null = null;
  #rootDir: string;
  #storesById = new Map<string, WorkspaceFileStore>();

  constructor(
    rootDir: string,
    {
      createStore = (repositoryRoot) => new WorkspaceFileStore(repositoryRoot, {
        createBlockId: randomUUID,
        createFolderId: () => `folder-${randomUUID().toLowerCase()}`,
        createNoteId: () => `note-${randomUUID().toLowerCase()}`,
        now: () => new Date().toISOString(),
      }),
      hostRoot = null,
      onRepositoryDeletionPhase = async () => {},
    }: LocalRepositoryCatalogOptions = {},
  ) {
    this.#createStore = createStore;
    if (hostRoot !== null && !path.isAbsolute(hostRoot)) {
      throw new RepositoryCatalogError(
        "invalid_request",
        "Local repository host root must be an absolute path",
      );
    }
    this.#hostRoot = hostRoot === null ? null : path.normalize(hostRoot);
    this.#onRepositoryDeletionPhase = onRepositoryDeletionPhase;
    this.#rootDir = path.resolve(rootDir);
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

  async dispose() {
    return this.#enqueueOperation(async () => {
      const stores = [...this.#storesById.values()];
      const storeDrains = stores.map((store) => store.closeForDeletion());

      await Promise.all(storeDrains);
      this.#storesById.clear();
      const release = this.#releaseWriterLock;

      this.#releaseWriterLock = null;
      this.#initializePromise = null;
      if (release) {
        await release();
      }
    });
  }

  async listRepositories(): Promise<RepositoryCatalogDto> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#assertWriterLock();
      const entries = await readdir(this.#rootDir, { withFileTypes: true });
      const repositoryIds = entries
        .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && isRepositoryId(entry.name))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
      const repositories: RepositoryDescriptorDto[] = [];
      const issues: RepositoryCatalogIssueDto[] = [];

      for (const repositoryId of repositoryIds) {
        try {
          const repositoryPath = this.#resolveRepositoryPath(repositoryId);
          const repositoryStats = await lstat(repositoryPath);
          if (!repositoryStats.isDirectory() || repositoryStats.isSymbolicLink()) {
            throw new WorkspaceRepositoryContractError(
              "$.layoutVersion",
              "Local repository root is invalid",
            );
          }
          const controlPath = path.join(
            repositoryPath,
            localControlDirectoryName,
          );
          const controlStats = await lstat(controlPath);
          if (!controlStats.isDirectory() || controlStats.isSymbolicLink()) {
            throw new WorkspaceRepositoryContractError(
              "$.layoutVersion",
              "Local control directory is invalid",
            );
          }
          const metadata = parseLocalRepositoryMetadata(await readLocalJson(
            path.join(
              controlPath,
              localRepositoryMetadataFileName,
            ),
          ));

          if (metadata.repositoryId !== repositoryId) {
            throw new WorkspaceRepositoryContractError(
              "$.repositoryId",
              "repository identity does not match its directory",
            );
          }

          repositories.push(this.#createDescriptor(repositoryId, metadata.label));
        } catch (error) {
          const code = this.#classifyCatalogIssue(error);

          issues.push({
            adapter: "local",
            code,
            id: repositoryId,
            location: this.#createLocation(repositoryId),
            message: code === "unsupported_repository_version"
              ? "Repository version is not supported"
              : "Repository metadata is invalid",
            status: "fault",
          });
        }
      }

      return { creatableAdapters: ["local"], issues, repositories };
    });
  }

  async createRepositoryWithId(
    request: CreateLocalRepositoryWithId,
  ): Promise<RepositoryDescriptorDto> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#assertWriterLock();
      const label = parsePortableName(request.label, "Repository label");
      const repositoryPath = this.#resolveRepositoryPath(request.id);

      if (await pathExists(repositoryPath)) {
        throw new RepositoryCatalogError(
          "invalid_request",
          `Repository already exists: ${request.id}`,
        );
      }

      const stagingPath = path.join(this.#rootDir, `.create-${request.id}-${randomUUID()}`);

      try {
        await createWorkspaceFileRepository({
          content: request.content,
          label,
          repositoryId: request.id,
          rootDir: stagingPath,
        });
        await rename(stagingPath, repositoryPath);
        await fsyncDirectory(this.#rootDir);
      } catch (error) {
        await rm(stagingPath, { force: true, recursive: true });
        throw error;
      }

      const store = this.#createStore(repositoryPath);
      this.#storesById.set(request.id, store);
      return this.#createDescriptor(request.id, label);
    });
  }

  async deleteRepository(repositoryId: string): Promise<void> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#assertWriterLock();
      const repositoryPath = this.#resolveRepositoryPath(repositoryId);
      const store = this.#storesById.get(repositoryId);

      if (store) {
        await store.closeForDeletion();
        this.#storesById.delete(repositoryId);
      }

      const stats = await lstat(repositoryPath).catch((error: unknown) => {
        if (hasFileSystemErrorCode(error, "ENOENT")) {
          return null;
        }
        throw error;
      });

      if (!stats) {
        return;
      }
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new RepositoryCatalogError(
          "invalid_request",
          "Repository is not a real directory",
        );
      }

      const canonicalPath = await realpath(repositoryPath).catch((error: unknown) => {
        if (hasFileSystemErrorCode(error, "ENOENT")) {
          return null;
        }
        throw error;
      });

      if (!canonicalPath) {
        return;
      }
      if (path.dirname(canonicalPath) !== this.#rootDir) {
        throw new RepositoryCatalogError(
          "invalid_request",
          "Repository escapes the configured root",
        );
      }

      await assertLocalRepositoryContainsOnlyManagedData(canonicalPath);

      const tombstonePath = path.join(
        this.#rootDir,
        `.delete-${repositoryId}-${randomUUID()}`,
      );

      try {
        await rename(repositoryPath, tombstonePath);
      } catch (error) {
        if (hasFileSystemErrorCode(error, "ENOENT")) {
          return;
        }
        throw error;
      }

      try {
        await this.#onRepositoryDeletionPhase(
          localRepositoryDeletionPhases.tombstoneRenamed,
        );
        await fsyncDirectory(this.#rootDir);
      } catch (error) {
        try {
          await rename(tombstonePath, repositoryPath);
          await fsyncDirectory(this.#rootDir);
        } catch (rollbackError) {
          const combined = new Error(
            "Repository deletion failed and could not be rolled back",
          ) as Error & { failures?: unknown[] };

          combined.failures = [error, rollbackError];
          throw combined;
        }
        throw error;
      }

      await Promise.resolve()
        .then(() => this.#onRepositoryDeletionPhase(
          localRepositoryDeletionPhases.deletionCommitted,
        ))
        .catch(() => undefined);

      // The durable rename above is the deletion commit point. Physical cleanup
      // is recoverable startup work and must not turn a committed deletion into
      // a reported failure.
      const cleaned = await rm(tombstonePath, { force: true, recursive: true })
        .then(() => true, () => false);

      if (cleaned) {
        await fsyncDirectory(this.#rootDir).catch(() => undefined);
        await Promise.resolve()
          .then(() => this.#onRepositoryDeletionPhase(
            localRepositoryDeletionPhases.cleanupCompleted,
          ))
          .catch(() => undefined);
      }
    });
  }

  async getStore(repositoryId: string) {
    return this.#enqueueOperation(() => this.#getStore(repositoryId));
  }

  async renameRepository(repositoryId: string, label: string) {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#assertWriterLock();
      const parsedLabel = parsePortableName(label, "Repository label");
      const store = await this.#getStore(repositoryId);

      await store.renameLabel(parsedLabel);
      return this.#createDescriptor(repositoryId, parsedLabel);
    });
  }

  async #getStore(repositoryId: string) {
    await this.initialize();
    this.#assertWriterLock();
    const repositoryPath = this.#resolveRepositoryPath(repositoryId);
    const stats = await lstat(repositoryPath).catch((error: unknown) => {
      if (hasFileSystemErrorCode(error, "ENOENT")) {
        throw new RepositoryCatalogError(
          "repository_not_found",
          `Repository does not exist: ${repositoryId}`,
        );
      }
      throw error;
    });

    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new RepositoryCatalogError("invalid_request", "Repository is not a real directory");
    }

    const canonicalPath = await realpath(repositoryPath);

    if (path.dirname(canonicalPath) !== this.#rootDir) {
      throw new RepositoryCatalogError("invalid_request", "Repository escapes the configured root");
    }

    const existing = this.#storesById.get(repositoryId);

    if (existing) {
      return existing;
    }

    const store = this.#createStore(canonicalPath);

    await store.initialize();
    this.#storesById.set(repositoryId, store);
    return store;
  }

  get rootPath() {
    return this.#rootDir;
  }

  async #initialize() {
    await mkdir(this.#rootDir, { recursive: true });
    this.#rootDir = await realpath(this.#rootDir);

    try {
      this.#releaseWriterLock = await lock(this.#rootDir, {
        lockfilePath: path.join(this.#rootDir, writerLockFileName),
        onCompromised: () => {
          this.#lockCompromised = true;
        },
        realpath: true,
        retries: 0,
        stale: 30_000,
        update: 10_000,
      });
      const entries = await readdir(this.#rootDir, { withFileTypes: true });
      const staleCreateDirectories = entries.filter(
        (entry) =>
          entry.isDirectory() && catalogCreateStagingPattern.test(entry.name),
      );
      const deletionTombstones = entries.filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.isSymbolicLink() &&
          repositoryDeletionTombstonePattern.test(entry.name),
      );

      if (staleCreateDirectories.length > 0 || deletionTombstones.length > 0) {
        await Promise.all(
          [...staleCreateDirectories, ...deletionTombstones].map((entry) =>
            rm(path.join(this.#rootDir, entry.name), {
              force: true,
              recursive: true,
            })
          ),
        );
        await fsyncDirectory(this.#rootDir);
      }
    } catch (error) {
      const release = this.#releaseWriterLock;

      this.#releaseWriterLock = null;
      if (release) {
        await release().catch(() => undefined);
      }
      if (error instanceof Error && "code" in error && error.code === "ELOCKED") {
        throw new RepositoryCatalogError(
          "repository_busy",
          "Local repository root is already owned by another server",
        );
      }
      throw error;
    }
  }

  #assertWriterLock() {
    if (this.#lockCompromised || !this.#releaseWriterLock) {
      throw new RepositoryCatalogError(
        "repository_busy",
        "Local repository writer lock was lost",
      );
    }
  }

  #classifyCatalogIssue(
    error: unknown,
  ): RepositoryCatalogIssueDto["code"] {
    if (error instanceof UnsupportedRepositoryVersionError) {
      return "unsupported_repository_version";
    }
    if (hasFileSystemErrorCode(error, "ENOENT")) {
      return "repository_corrupt";
    }
    if (error instanceof RepositoryCorruptError ||
        error instanceof SyntaxError ||
        error instanceof WorkspaceRepositoryContractError) {
      return "repository_corrupt";
    }
    return "adapter_unavailable";
  }

  #createDescriptor(repositoryId: string, label: string): RepositoryDescriptorDto {
    return {
      adapter: "local",
      id: repositoryId,
      label,
      labelIssue: null,
      location: this.#createLocation(repositoryId),
    };
  }

  #createLocation(repositoryId: string) {
    return {
      hostPath: this.#hostRoot === null
        ? null
        : path.join(this.#hostRoot, repositoryId),
      serverPath: this.#resolveRepositoryPath(repositoryId),
      type: "local" as const,
    };
  }

  #resolveRepositoryPath(repositoryId: string) {
    if (!isRepositoryId(repositoryId)) {
      throw new RepositoryCatalogError("invalid_request", `Invalid repository id: ${repositoryId}`);
    }

    const repositoryPath = path.resolve(this.#rootDir, repositoryId);

    if (path.dirname(repositoryPath) !== this.#rootDir) {
      throw new RepositoryCatalogError("invalid_request", "Repository escapes the configured root");
    }
    return repositoryPath;
  }

  #enqueueOperation<Result>(operation: () => Promise<Result>) {
    const result = this.#operationQueue.then(operation);
    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
