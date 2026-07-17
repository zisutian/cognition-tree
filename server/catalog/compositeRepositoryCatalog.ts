// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { isRepositoryId } from "../../contracts/workspace-repository/parseCatalog.ts";
import type {
  CreateRepositoryDto,
  RepositoryCatalogDto,
  RepositoryDeletionModeDto,
  RepositoryDeletionResultDto,
  RepositoryDescriptorDto,
  WorkspaceRepositoryContentDto,
} from "../../contracts/workspace-repository/types.ts";
import {
  RepositoryCatalogError,
  type WorkspaceRepositoryCatalog,
} from "../repository/repositoryCatalog.ts";
import type { WorkspaceRepositoryStore } from "../repository/repositoryStore.ts";

type LocalCatalogPort = {
  createRepositoryWithId(input: {
    content: WorkspaceRepositoryContentDto;
    id: string;
    label: string;
  }): Promise<RepositoryDescriptorDto>;
  deleteRepository(repositoryId: string): Promise<void>;
  dispose(): Promise<void>;
  getStore(repositoryId: string): Promise<WorkspaceRepositoryStore>;
  initialize(): Promise<void>;
  listRepositories(): Promise<RepositoryCatalogDto>;
};

type WebDavRegistryPort = {
  deleteManagedData(repositoryId: string): Promise<{
    status: "deleted" | "deleting";
  }>;
  dispose(): Promise<void>;
  getStore(repositoryId: string): Promise<WorkspaceRepositoryStore>;
  hasEntry(repositoryId: string): boolean;
  initialize(): Promise<void>;
  listEntries(): Promise<Pick<RepositoryCatalogDto, "issues" | "repositories">>;
  register(input: {
    authentication: Extract<CreateRepositoryDto, { adapter: "webdav" }>["authentication"];
    id: string;
    initialContent: WorkspaceRepositoryContentDto;
    label: string;
    url: string;
  }): Promise<RepositoryDescriptorDto>;
  removeConnection(repositoryId: string): Promise<boolean>;
  retryDeletion(repositoryId: string): Promise<{
    status: "deleted" | "deleting";
  }>;
};

type CompositeRepositoryCatalogOptions = {
  createId?: () => string;
};

const maximumIdAllocationAttempts = 100;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class CompositeRepositoryCatalog implements WorkspaceRepositoryCatalog {
  readonly #createId: () => string;
  #initialized = false;
  readonly #localCatalog: LocalCatalogPort;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #webDavRegistry: WebDavRegistryPort;

  constructor(
    localCatalog: LocalCatalogPort,
    webDavRegistry: WebDavRegistryPort,
    { createId = randomUUID }: CompositeRepositoryCatalogOptions = {},
  ) {
    this.#createId = createId;
    this.#localCatalog = localCatalog;
    this.#webDavRegistry = webDavRegistry;
  }

  async initialize() {
    if (this.#initialized) {
      return;
    }

    // Registry first, Local second. Shutdown uses the reverse order.
    await this.#webDavRegistry.initialize();
    try {
      await this.#localCatalog.initialize();
      const catalog = await this.#listRepositories();
      const ids = new Set<string>();

      for (const entry of [...catalog.repositories, ...catalog.issues]) {
        if (ids.has(entry.id)) {
          throw new RepositoryCatalogError(
            "internal_error",
            `Repository id is registered more than once: ${entry.id}`,
          );
        }
        ids.add(entry.id);
      }
      this.#initialized = true;
    } catch (error) {
      await this.#localCatalog.dispose().catch(() => undefined);
      await this.#webDavRegistry.dispose().catch(() => undefined);
      throw error;
    }
  }

  async dispose() {
    await this.#operationQueue;
    await this.#localCatalog.dispose();
    await this.#webDavRegistry.dispose();
    this.#initialized = false;
  }

  async createRepository(request: CreateRepositoryDto) {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      const repositoryId = await this.#allocateRepositoryId();

      if (request.adapter === "local") {
        return this.#localCatalog.createRepositoryWithId({
          content: request.content,
          id: repositoryId,
          label: request.label,
        });
      }
      return this.#webDavRegistry.register({
        authentication: request.authentication,
        id: repositoryId,
        initialContent: request.initialContent,
        label: request.label,
        url: request.url,
      });
    });
  }

  async deleteRepository(
    repositoryId: string,
    mode: RepositoryDeletionModeDto,
  ): Promise<RepositoryDeletionResultDto> {
    return this.#enqueueOperation(async () => {
      await this.initialize();

      if (!isRepositoryId(repositoryId)) {
        throw new RepositoryCatalogError(
          "invalid_request",
          `Invalid repository id: ${repositoryId}`,
        );
      }
      const catalog = await this.#listRepositories();
      const entry = [...catalog.repositories, ...catalog.issues]
        .find(({ id }) => id === repositoryId);

      if (!entry) {
        return { status: "deleted" };
      }
      if (entry.adapter === "local") {
        if (mode !== "delete-managed-data") {
          throw new RepositoryCatalogError(
            "invalid_request",
            "Local repositories only support managed-data deletion",
          );
        }
        await this.#localCatalog.deleteRepository(repositoryId);
        return { status: "deleted" };
      }
      if (entry.adapter !== "webdav") {
        throw new RepositoryCatalogError(
          "invalid_request",
          "Browser repositories are not managed by the HTTP server",
        );
      }
      if (mode === "remove-connection") {
        await this.#webDavRegistry.removeConnection(repositoryId);
        return { status: "deleted" };
      }
      if ("status" in entry && entry.status === "fault") {
        throw new RepositoryCatalogError(
          "invalid_request",
          "Invalid WebDAV connection data can only be removed locally",
        );
      }
      const result = "status" in entry && entry.status === "deleting"
        ? await this.#webDavRegistry.retryDeletion(repositoryId)
        : await this.#webDavRegistry.deleteManagedData(repositoryId);

      return { status: result.status };
    });
  }

  async getStore(repositoryId: string) {
    return this.#enqueueOperation(async () => {
      await this.initialize();

      return this.#webDavRegistry.hasEntry(repositoryId)
        ? this.#webDavRegistry.getStore(repositoryId)
        : this.#localCatalog.getStore(repositoryId);
    });
  }

  async listRepositories() {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      return this.#listRepositories();
    });
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

  async #listRepositories(): Promise<RepositoryCatalogDto> {
    const [local, webdav] = await Promise.all([
      this.#localCatalog.listRepositories(),
      this.#webDavRegistry.listEntries(),
    ]);

    return {
      creatableAdapters: ["local", "webdav"],
      issues: [...local.issues, ...webdav.issues]
        .sort((left, right) => left.id.localeCompare(right.id)),
      repositories: [...local.repositories, ...webdav.repositories]
        .sort((left, right) => left.id.localeCompare(right.id)),
    };
  }

  #enqueueOperation<Result>(operation: () => Promise<Result>) {
    const result = this.#operationQueue.then(operation);
    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
