// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import type {
  CreateRepositoryDto,
  RepositoryCatalogDto,
  RepositoryDescriptorDto,
} from "../contracts/workspace-repository/types.ts";
import { isRepositoryId } from "../contracts/workspace-repository/parseCatalog.ts";
import { WorkspaceFileStore } from "./workspaceFileStore.ts";

export class RepositoryCatalogError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "RepositoryCatalogError";
    this.statusCode = statusCode;
  }
}

async function pathExists(filePath: string) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }

    throw error;
  }
}

export class LocalRepositoryCatalog {
  #rootDir: string;
  #initializePromise: Promise<void> | null = null;
  #operationQueue: Promise<void> = Promise.resolve();
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

  async listRepositories(): Promise<RepositoryCatalogDto> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      const entries = await readdir(this.#rootDir, { withFileTypes: true });
      const repositoryIds = entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            !entry.isSymbolicLink() &&
            isRepositoryId(entry.name),
        )
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
      const repositories = await Promise.all(
        repositoryIds.map(async (repositoryId) => {
          const store = await this.#getStore(repositoryId);
          const snapshot = await store.loadSnapshot();

          return this.#createDescriptor(
            repositoryId,
            snapshot.workspace.name,
          );
        }),
      );

      return { repositories };
    });
  }

  async createRepository(
    request: CreateRepositoryDto,
  ): Promise<RepositoryDescriptorDto> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      const repositoryPath = this.#resolveRepositoryPath(request.id);

      if (await pathExists(repositoryPath)) {
        throw new RepositoryCatalogError(
          409,
          `Repository already exists: ${request.id}`,
        );
      }

      const stagingPath = path.join(
        this.#rootDir,
        `.create-${request.id}-${randomUUID()}`,
      );

      try {
        const stagingStore = new WorkspaceFileStore(stagingPath);
        const emptySnapshot = await stagingStore.loadSnapshot();

        await stagingStore.commitSnapshot({
          ...request.content,
          baseRevision: emptySnapshot.revision,
        });
        await rename(stagingPath, repositoryPath);
      } catch (error) {
        await rm(stagingPath, { force: true, recursive: true });
        throw error;
      }

      const store = new WorkspaceFileStore(repositoryPath);
      this.#storesById.set(request.id, store);
      return this.#createDescriptor(request.id, request.content.workspace.name);
    });
  }

  async getStore(repositoryId: string) {
    return this.#enqueueOperation(() => this.#getStore(repositoryId));
  }

  async #getStore(repositoryId: string) {
    await this.initialize();
    const repositoryPath = this.#resolveRepositoryPath(repositoryId);
    const stats = await lstat(repositoryPath).catch((error: unknown) => {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new RepositoryCatalogError(
          404,
          `Repository does not exist: ${repositoryId}`,
        );
      }

      throw error;
    });

    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new RepositoryCatalogError(
        400,
        `Repository is not a real directory: ${repositoryId}`,
      );
    }

    const canonicalPath = await realpath(repositoryPath);

    if (path.dirname(canonicalPath) !== this.#rootDir) {
      throw new RepositoryCatalogError(
        400,
        `Repository escapes the configured root: ${repositoryId}`,
      );
    }

    const existing = this.#storesById.get(repositoryId);

    if (existing) {
      return existing;
    }

    const store = new WorkspaceFileStore(canonicalPath);
    this.#storesById.set(repositoryId, store);
    return store;
  }

  get rootPath() {
    return this.#rootDir;
  }

  async #initialize() {
    await mkdir(this.#rootDir, { recursive: true });
    this.#rootDir = await realpath(this.#rootDir);
  }

  #createDescriptor(
    repositoryId: string,
    label: string,
  ): RepositoryDescriptorDto {
    return {
      adapter: "local",
      id: repositoryId,
      label,
      repositoryPath: this.#resolveRepositoryPath(repositoryId),
    };
  }

  #resolveRepositoryPath(repositoryId: string) {
    if (!isRepositoryId(repositoryId)) {
      throw new RepositoryCatalogError(
        400,
        `Invalid repository id: ${repositoryId}`,
      );
    }

    const repositoryPath = path.resolve(this.#rootDir, repositoryId);

    if (path.dirname(repositoryPath) !== this.#rootDir) {
      throw new RepositoryCatalogError(
        400,
        `Repository escapes the configured root: ${repositoryId}`,
      );
    }

    return repositoryPath;
  }

  #enqueueOperation<Result>(operation: () => Promise<Result>) {
    const result = this.#operationQueue.then(operation);

    this.#operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
