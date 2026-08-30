// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import { isRepositoryId } from "../../../../../contracts/workspace/parseCatalog.ts";
import {
  createPortableNameKey,
  parsePortableName,
} from "../../../../../core/naming/portableName.ts";
import type {
  CreateRepositoryDto,
  RepositoryCatalogDto,
  RepositoryDescriptorDto,
  RenameRepositoryDto,
  WorkspaceRepositoryContentDto,
} from "../../../../../contracts/workspace/types.ts";
import {
  RepositoryCatalogError,
  type WorkspaceRepositoryCatalog,
} from "../../catalog.ts";
import { fsyncDirectory } from "../../../persistence/fileSystemPersistence.ts";
import { hasFileSystemErrorCode } from "../../../persistence/fileSystemError.ts";
import {
  WorkspaceFileStore,
} from "./workspaceFileStore.ts";
import {
  provisionWorkspaceFileRepository,
} from "./workspaceFileRepositoryProvisioning.ts";
import {
  deleteLocalRepositoryDirectory,
  type LocalRepositoryDeletionPhase,
} from "./localRepositoryDeletion.ts";
import { readLocalRepositoryCatalog } from "./localRepositoryInventory.ts";

const writerLockFileName = ".ctn-writer.lock";
const catalogCreateStagingPattern =
  /^\.create-.+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const repositoryDeletionTombstonePattern =
  /^\.delete-.+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maximumIdAllocationAttempts = 100;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const reservedRepositoryLabelKeys = new Set([
  createPortableNameKey("日记"),
  createPortableNameKey("代办"),
]);

type LocalRepositoryCatalogOptions = {
  createId?: () => string;
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

export class LocalRepositoryCatalog implements WorkspaceRepositoryCatalog {
  #createId: NonNullable<LocalRepositoryCatalogOptions["createId"]>;
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
      createId = randomUUID,
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
    this.#createId = createId;
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
      return this.#listRepositories();
    });
  }

  async createRepository(
    request: CreateRepositoryDto,
  ): Promise<RepositoryDescriptorDto> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#assertWriterLock();
      const label = await this.#assertAvailableLabel(request.label);
      const id = await this.#allocateRepositoryId();

      return this.#createRepositoryWithId({ content: request.content, id, label });
    });
  }

  async createRepositoryWithId(
    request: CreateLocalRepositoryWithId,
  ): Promise<RepositoryDescriptorDto> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#assertWriterLock();
      return this.#createRepositoryWithId(request);
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
      await deleteLocalRepositoryDirectory({
        onPhase: this.#onRepositoryDeletionPhase,
        repositoryId,
        repositoryPath,
        rootDir: this.#rootDir,
      });
    });
  }

  async getStore(repositoryId: string) {
    return this.#enqueueOperation(() => this.#getStore(repositoryId));
  }

  async renameRepository(repositoryId: string, request: RenameRepositoryDto) {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#assertWriterLock();
      const parsedLabel = await this.#assertAvailableLabel(
        request.label,
        repositoryId,
      );
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

  async #allocateRepositoryId() {
    const catalog = await this.#listRepositories();
    const reservedIds = new Set(
      [...catalog.repositories, ...catalog.issues].map(({ id }) => id),
    );

    for (let attempt = 0; attempt < maximumIdAllocationAttempts; attempt += 1) {
      const uuid = this.#createId().toLowerCase();

      if (!uuidPattern.test(uuid)) {
        continue;
      }
      const candidate = `repository-${uuid}`;

      if (!reservedIds.has(candidate)) {
        return candidate;
      }
    }
    throw new RepositoryCatalogError(
      "internal_error",
      "Repository id allocation failed",
    );
  }

  async #assertAvailableLabel(labelValue: string, excludedId?: string) {
    let label: string;

    try {
      label = parsePortableName(labelValue, "Repository label");
    } catch {
      throw new RepositoryCatalogError(
        "invalid_request",
        "Repository label must be portable",
      );
    }
    const key = createPortableNameKey(label);
    if (reservedRepositoryLabelKeys.has(key)) {
      throw new RepositoryCatalogError(
        "invalid_request",
        "Repository label is reserved for a system repository",
      );
    }
    const catalog = await this.#listRepositories();
    if (catalog.repositories.some((repository) =>
      repository.id !== excludedId &&
      createPortableNameKey(repository.label) === key
    )) {
      throw new RepositoryCatalogError(
        "invalid_request",
        "Repository label is already in use",
      );
    }
    return label;
  }

  async #createRepositoryWithId(
    request: CreateLocalRepositoryWithId,
  ): Promise<RepositoryDescriptorDto> {
    const label = parsePortableName(request.label, "Repository label");
    const repositoryPath = this.#resolveRepositoryPath(request.id);

    if (await pathExists(repositoryPath)) {
      throw new RepositoryCatalogError(
        "invalid_request",
        `Repository already exists: ${request.id}`,
      );
    }

    const stagingPath = path.join(
      this.#rootDir,
      `.create-${request.id}-${randomUUID()}`,
    );

    try {
      await provisionWorkspaceFileRepository({
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
  }

  async #listRepositories(): Promise<RepositoryCatalogDto> {
    return readLocalRepositoryCatalog({
      createDescriptor: (repositoryId, label) =>
        this.#createDescriptor(repositoryId, label),
      createLocation: (repositoryId) => this.#createLocation(repositoryId),
      isReservedLabel: (label) =>
        reservedRepositoryLabelKeys.has(createPortableNameKey(label)),
      resolveRepositoryPath: (repositoryId) =>
        this.#resolveRepositoryPath(repositoryId),
      rootDir: this.#rootDir,
    });
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

  #createDescriptor(repositoryId: string, label: string): RepositoryDescriptorDto {
    return {
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
