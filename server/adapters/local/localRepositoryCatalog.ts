// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import { isRepositoryId } from "../../../contracts/workspace-repository/parseCatalog.ts";
import {
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "../../../contracts/workspace-repository/contractValue.ts";
import type {
  CreateRepositoryDto,
  RepositoryCatalogDto,
  RepositoryCatalogIssueDto,
  RepositoryDescriptorDto,
} from "../../../contracts/workspace-repository/types.ts";
import {
  parseRepositoryMetadata,
} from "../../repository/repositoryMetadata.ts";
import {
  RepositoryCatalogError,
} from "../../repository/repositoryCatalog.ts";
import {
  repositoryMetadataFileName,
  workspaceFileName,
} from "../../repository/workspaceRepositoryLayout.ts";
import { fsyncDirectory } from "./atomicWrite.ts";
import { hasFileSystemErrorCode } from "./fileSystemError.ts";
import {
  createWorkspaceFileRepository,
  WorkspaceFileStore,
} from "./workspaceFileStore.ts";

const writerLockFileName = ".ctn-writer.lock";
const catalogCreateStagingPattern =
  /^\.create-.+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export class LocalRepositoryCatalog {
  #initializePromise: Promise<void> | null = null;
  #lockCompromised = false;
  #operationQueue: Promise<void> = Promise.resolve();
  #releaseWriterLock: (() => Promise<void>) | null = null;
  #rootDir: string;
  #storesById = new Map<string, WorkspaceFileStore>();

  constructor(rootDir: string) {
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
    const release = this.#releaseWriterLock;

    this.#releaseWriterLock = null;
    this.#initializePromise = null;
    if (release) {
      await release();
    }
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
          const metadata = parseRepositoryMetadata(await readJson(
            path.join(this.#resolveRepositoryPath(repositoryId), repositoryMetadataFileName),
          ));

          repositories.push(this.#createDescriptor(repositoryId, metadata.label));
        } catch (error) {
          const code = await this.#classifyCatalogIssue(repositoryId, error);

          issues.push({
            code,
            id: repositoryId,
            locationLabel: this.#createLocationLabel(repositoryId),
            message: code === "unsupported_repository_version"
              ? "Repository version is not supported"
              : "Repository metadata is invalid",
          });
        }
      }

      return { issues, repositories };
    });
  }

  async createRepository(request: CreateRepositoryDto): Promise<RepositoryDescriptorDto> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#assertWriterLock();
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
          label: request.label,
          rootDir: stagingPath,
        });
        await rename(stagingPath, repositoryPath);
        await fsyncDirectory(this.#rootDir);
      } catch (error) {
        await rm(stagingPath, { force: true, recursive: true });
        throw error;
      }

      const store = new WorkspaceFileStore(repositoryPath);
      this.#storesById.set(request.id, store);
      return this.#createDescriptor(request.id, request.label);
    });
  }

  async getStore(repositoryId: string) {
    return this.#enqueueOperation(() => this.#getStore(repositoryId));
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

    const store = new WorkspaceFileStore(canonicalPath);

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

      if (staleCreateDirectories.length > 0) {
        await Promise.all(
          staleCreateDirectories.map((entry) =>
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

  async #classifyCatalogIssue(
    repositoryId: string,
    error: unknown,
  ): Promise<RepositoryCatalogIssueDto["code"]> {
    if (error instanceof UnsupportedRepositoryVersionError) {
      return "unsupported_repository_version";
    }
    if (hasFileSystemErrorCode(error, "ENOENT")) {
      const legacyManifest = path.join(this.#resolveRepositoryPath(repositoryId), workspaceFileName);

      return await pathExists(legacyManifest)
        ? "unsupported_repository_version"
        : "repository_corrupt";
    }
    if (error instanceof SyntaxError || error instanceof WorkspaceRepositoryContractError) {
      return "repository_corrupt";
    }
    return "adapter_unavailable";
  }

  #createDescriptor(repositoryId: string, label: string): RepositoryDescriptorDto {
    return {
      adapter: "local",
      id: repositoryId,
      label,
      locationLabel: this.#createLocationLabel(repositoryId),
    };
  }

  #createLocationLabel(repositoryId: string) {
    return `local:${repositoryId}`;
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
