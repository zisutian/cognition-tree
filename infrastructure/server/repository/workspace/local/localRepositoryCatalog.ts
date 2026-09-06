// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { lstat, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { isRepositoryId } from "../../../../../contracts/workspace/index.ts";
import {
  createPortableNameKey,
  parsePortableName,
} from "../../../../../core/naming/index.ts";
import type {
  CreateRepositoryDto,
  RepositoryCatalogDto,
  RepositoryDescriptorDto,
  RenameRepositoryDto,
  WorkspaceRepositoryContentDto,
} from "../../../../../contracts/workspace/index.ts";
import {
  RepositoryCatalogError,
  type WorkspaceRepositoryCatalog,
} from "../../catalog.ts";
import {
  fsyncDirectory,
  hasFileSystemErrorCode,
} from "../../../persistence/index.ts";

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
import { LocalRepositoryRootLease } from "./localRepositoryRootLease.ts";

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
  #acceptingOperations = true;
  #createId: NonNullable<LocalRepositoryCatalogOptions["createId"]>;
  #createStore: NonNullable<LocalRepositoryCatalogOptions["createStore"]>;
  #disposePromise: Promise<void> | null = null;
  #hostRoot: string | null;
  #onRepositoryDeletionPhase: NonNullable<
    LocalRepositoryCatalogOptions["onRepositoryDeletionPhase"]
  >;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #rootLease: LocalRepositoryRootLease;
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
    this.#rootLease = new LocalRepositoryRootLease(rootDir);
  }

  initialize() {
    this.#assertAcceptingOperations();
    return this.#enqueueOperation(() => this.#rootLease.initialize());
  }

  dispose() {
    if (this.#disposePromise) return this.#disposePromise;
    this.#acceptingOperations = false;
    this.#disposePromise = this.#enqueueOperation(async () => {
      const stores = [...this.#storesById.values()];
      const storeDrains = stores.map((store) => store.closeForDeletion());

      await Promise.all(storeDrains);
      this.#storesById.clear();
      await this.#rootLease.dispose();
    });
    return this.#disposePromise;
  }

  async listRepositories(): Promise<RepositoryCatalogDto> {
    this.#assertAcceptingOperations();
    return this.#enqueueOperation(async () => {
      await this.#rootLease.initialize();
      this.#rootLease.assertOwned();
      return this.#listRepositories();
    });
  }

  async createRepository(
    request: CreateRepositoryDto,
  ): Promise<RepositoryDescriptorDto> {
    this.#assertAcceptingOperations();
    return this.#enqueueOperation(async () => {
      await this.#rootLease.initialize();
      this.#rootLease.assertOwned();
      const label = await this.#assertAvailableLabel(request.label);
      const id = await this.#allocateRepositoryId();

      return this.#createRepositoryWithId({ content: request.content, id, label });
    });
  }

  async createRepositoryWithId(
    request: CreateLocalRepositoryWithId,
  ): Promise<RepositoryDescriptorDto> {
    this.#assertAcceptingOperations();
    return this.#enqueueOperation(async () => {
      await this.#rootLease.initialize();
      this.#rootLease.assertOwned();
      return this.#createRepositoryWithId(request);
    });
  }

  async deleteRepository(repositoryId: string): Promise<void> {
    this.#assertAcceptingOperations();
    return this.#enqueueOperation(async () => {
      await this.#rootLease.initialize();
      this.#rootLease.assertOwned();
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
        rootDir: this.#rootLease.rootPath,
      });
    });
  }

  async getStore(repositoryId: string) {
    this.#assertAcceptingOperations();
    return this.#enqueueOperation(() => this.#getStore(repositoryId));
  }

  async renameRepository(repositoryId: string, request: RenameRepositoryDto) {
    this.#assertAcceptingOperations();
    return this.#enqueueOperation(async () => {
      await this.#rootLease.initialize();
      this.#rootLease.assertOwned();
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
    await this.#rootLease.initialize();
    this.#rootLease.assertOwned();
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

    if (path.dirname(canonicalPath) !== this.#rootLease.rootPath) {
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
    return this.#rootLease.rootPath;
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
      this.#rootLease.rootPath,
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
      await fsyncDirectory(this.#rootLease.rootPath);
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
      rootDir: this.#rootLease.rootPath,
    });
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

    const repositoryPath = path.resolve(
      this.#rootLease.rootPath,
      repositoryId,
    );

    if (path.dirname(repositoryPath) !== this.#rootLease.rootPath) {
      throw new RepositoryCatalogError("invalid_request", "Repository escapes the configured root");
    }
    return repositoryPath;
  }

  #assertAcceptingOperations() {
    if (!this.#acceptingOperations) {
      throw new RepositoryCatalogError(
        "adapter_unavailable",
        "Local repository catalog is disposed",
      );
    }
  }

  #enqueueOperation<Result>(operation: () => Promise<Result>) {
    const result = this.#operationQueue.then(operation);
    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
