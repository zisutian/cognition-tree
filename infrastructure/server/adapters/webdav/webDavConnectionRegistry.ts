// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { parsePortableName } from "../../../../core/naming/portableName.ts";
import type {
  RepositoryAuthenticationDto,
  RepositoryCatalogIssueDto,
  RepositoryDescriptorDto,
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/types.ts";
import { RepositoryCatalogError } from "../../repository/catalog.ts";
import type { WorkspaceRepositoryStore } from "../../repository/store.ts";
import {
  createWebDavTransport,
  probeWebDavCapabilities,
  type WebDavTransport,
} from "./webDavTransport.ts";
import type { WebDavPrivateTargetPolicy } from "./webDavTargetPolicy.ts";
import { parseWebDavPrivateTargets } from "./webDavTargetPolicy.ts";
import {
  WebDavWorkspaceStore,
  type WebDavManagedDataDeletionResult,
} from "./webDavWorkspaceStore.ts";
import {
  WebDavDeletionCoordinator,
} from "./webDavDeletionCoordinator.ts";
import {
  parseWebDavConnectionConfig,
  webDavConnectionConfigVersion,
  type ActiveWebDavConnectionConfig,
  type WebDavConnectionConfig,
} from "./webDavConnectionConfig.ts";
import {
  cleanInterruptedWebDavConnectionFiles,
  loadWebDavConnectionConfigs,
  removeWebDavConnectionConfig,
  webDavConnectionConfigExists,
  writeWebDavConnectionConfig,
  type WebDavRegistryConfigRemovalPhase,
} from "./webDavConnectionPersistence.ts";
import {
  WebDavRegistryLease,
} from "./webDavRegistryLease.ts";

export type RegisterWebDavConnectionInput = {
  authentication: RepositoryAuthenticationDto;
  id: string;
  initialContent: WorkspaceRepositoryContentDto;
  label: string;
  url: string;
};

export type WebDavConnectionRegistryEntries = {
  issues: RepositoryCatalogIssueDto[];
  repositories: RepositoryDescriptorDto[];
};

export type WebDavConnectionRegistryOptions = {
  createId?: () => string;
  now?: () => number;
  onConfigRemovalPhase?: (
    phase: WebDavRegistryConfigRemovalPhase,
  ) => Promise<void> | void;
  privateTargetPolicy?: WebDavPrivateTargetPolicy;
  stateDirectory: string;
  transportFactory?: (config: WebDavConnectionConfig) => WebDavTransport;
};

function createDescriptor(config: WebDavConnectionConfig): RepositoryDescriptorDto {
  return {
    adapter: "webdav",
    id: config.id,
    label: config.label,
    labelIssue: null,
    location: { type: "webdav", url: config.url },
  };
}

export class WebDavConnectionRegistry {
  readonly #configsById = new Map<string, WebDavConnectionConfig>();
  readonly #createId: () => string;
  readonly #deletionCoordinator: WebDavDeletionCoordinator;
  #initializePromise: Promise<void> | null = null;
  readonly #issuesById = new Map<string, RepositoryCatalogIssueDto>();
  readonly #lease: WebDavRegistryLease;
  readonly #onConfigRemovalPhase: NonNullable<
    WebDavConnectionRegistryOptions["onConfigRemovalPhase"]
  >;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #privateTargetPolicy: WebDavPrivateTargetPolicy;
  readonly #storesById = new Map<string, WebDavWorkspaceStore>();
  readonly #transportFactory: (
    config: WebDavConnectionConfig,
  ) => WebDavTransport;

  constructor({
    createId = randomUUID,
    now = Date.now,
    onConfigRemovalPhase = async () => {},
    privateTargetPolicy = parseWebDavPrivateTargets(undefined),
    stateDirectory,
    transportFactory,
  }: WebDavConnectionRegistryOptions) {
    this.#createId = createId;
    this.#lease = new WebDavRegistryLease(stateDirectory);
    this.#onConfigRemovalPhase = onConfigRemovalPhase;
    this.#privateTargetPolicy = privateTargetPolicy;
    this.#transportFactory = transportFactory ?? ((config) =>
      createWebDavTransport({
        ...(config.authentication.type === "basic"
          ? {
              password: config.authentication.password,
              username: config.authentication.username,
            }
          : {}),
        privateTargetPolicy: this.#privateTargetPolicy,
        url: config.url,
      }));
    this.#deletionCoordinator = new WebDavDeletionCoordinator({
      configsById: this.#configsById,
      createId: this.#createId,
      forgetStore: (repositoryId) => {
        this.#storesById.delete(repositoryId);
      },
      getOrCreateStore: (config) => this.#getOrCreateStore(config),
      issuesById: this.#issuesById,
      now,
      removeConfigFile: (repositoryId) =>
        this.#removeConfigFile(repositoryId),
      requestRetry: (repositoryId) => this.retryDeletion(repositoryId),
      writeConfig: (config) => writeWebDavConnectionConfig(
        this.#lease.connectionsDirectory,
        config,
      ),
    });
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
    this.#deletionCoordinator.dispose();
    await this.#operationQueue;
    await Promise.all(
      [...this.#storesById.values()].map((store) => store.closeForDeletion()),
    );
    this.#storesById.clear();
    this.#initializePromise = null;
    await this.#lease.release();
  }

  async listEntries(): Promise<WebDavConnectionRegistryEntries> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#lease.assertOwned();
      return {
        issues: [...this.#issuesById.values()].sort((left, right) =>
          left.id.localeCompare(right.id)),
        repositories: [...this.#configsById.values()]
          .filter((config): config is ActiveWebDavConnectionConfig =>
            config.status === "active")
          .map(createDescriptor)
          .sort((left, right) => left.id.localeCompare(right.id)),
      };
    });
  }

  async getStore(repositoryId: string): Promise<WorkspaceRepositoryStore> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#lease.assertOwned();
      const config = this.#configsById.get(repositoryId);

      if (!config || config.status !== "active") {
        throw new RepositoryCatalogError(
          "repository_not_found",
          `WebDAV repository does not exist: ${repositoryId}`,
        );
      }
      return this.#getOrCreateStore(config);
    });
  }

  async register(
    input: RegisterWebDavConnectionInput,
  ): Promise<RepositoryDescriptorDto> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#lease.assertOwned();
      const label = parsePortableName(input.label, "Repository label");
      const config = parseWebDavConnectionConfig(JSON.stringify({
        authentication: input.authentication,
        id: input.id,
        label,
        schemaVersion: webDavConnectionConfigVersion,
        status: "active",
        url: input.url,
      }));

      if (
        this.#configsById.has(config.id) ||
        this.#issuesById.has(config.id) ||
        await webDavConnectionConfigExists(
          this.#lease.connectionsDirectory,
          config.id,
        )
      ) {
        throw new RepositoryCatalogError(
          "invalid_request",
          `Repository already exists: ${config.id}`,
        );
      }
      if ([...this.#configsById.values()].some(
        (entry) => entry.url === config.url,
      )) {
        throw new RepositoryCatalogError(
          "invalid_request",
          "WebDAV target is already registered",
        );
      }

      const transport = this.#transportFactory(config);

      await probeWebDavCapabilities(transport);
      const store = new WebDavWorkspaceStore({
        allowEmptyTargetInitialization: true,
        createId: this.#createId,
        initialContent: input.initialContent,
        transport,
      });

      await store.initialize();
      await writeWebDavConnectionConfig(
        this.#lease.connectionsDirectory,
        config,
      );
      this.#configsById.set(config.id, config);
      this.#storesById.set(config.id, store);
      return createDescriptor(config);
    });
  }

  async removeConnection(repositoryId: string): Promise<boolean> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#lease.assertOwned();
      this.#deletionCoordinator.cancel(repositoryId);
      const store = this.#storesById.get(repositoryId);

      if (store) {
        await store.closeForDeletion();
      }
      let removed: boolean;

      try {
        removed = await this.#removeConfigFile(repositoryId);
      } catch (error) {
        this.#storesById.delete(repositoryId);
        throw error;
      }

      this.#configsById.delete(repositoryId);
      this.#issuesById.delete(repositoryId);
      this.#storesById.delete(repositoryId);
      return removed;
    });
  }

  async renameConnection(repositoryId: string, label: string) {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#lease.assertOwned();
      const current = this.#configsById.get(repositoryId);

      if (!current || current.status !== "active") {
        throw new RepositoryCatalogError(
          "repository_not_found",
          `WebDAV repository does not exist: ${repositoryId}`,
        );
      }
      const parsedLabel = parsePortableName(label, "Repository label");
      const renamed = parseWebDavConnectionConfig(JSON.stringify({
        ...current,
        label: parsedLabel,
      }));

      await writeWebDavConnectionConfig(
        this.#lease.connectionsDirectory,
        renamed,
      );
      this.#configsById.set(repositoryId, renamed);
      return createDescriptor(renamed);
    });
  }

  async deleteManagedData(
    repositoryId: string,
  ): Promise<WebDavManagedDataDeletionResult> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#lease.assertOwned();
      return this.#deletionCoordinator.deleteManagedData(repositoryId);
    });
  }

  async retryDeletion(
    repositoryId: string,
  ): Promise<WebDavManagedDataDeletionResult> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#lease.assertOwned();
      return this.#deletionCoordinator.retryDeletion(repositoryId);
    });
  }

  hasEntry(repositoryId: string) {
    return this.#configsById.has(repositoryId) || this.#issuesById.has(repositoryId);
  }

  async #initialize() {
    await this.#lease.acquire();
    try {
      await cleanInterruptedWebDavConnectionFiles(
        this.#lease.connectionsDirectory,
      );
      await this.#loadConnections();
      [...this.#configsById.values()]
        .filter((config) => config.status === "deleting-remote")
        .forEach((config) =>
          this.#deletionCoordinator.resume(config.id)
        );
    } catch (error) {
      await this.#lease.release().catch(() => undefined);
      throw error;
    }
  }

  async #loadConnections() {
    const { configs, issues } = await loadWebDavConnectionConfigs(
      this.#lease.connectionsDirectory,
    );

    this.#configsById.clear();
    this.#issuesById.clear();
    configs.forEach((config, repositoryId) => {
      this.#configsById.set(repositoryId, config);
      if (config.status === "deleting-remote") {
        this.#deletionCoordinator.publishDeletingIssue(config);
      }
    });
    for (const [repositoryId, issue] of issues) {
      this.#issuesById.set(repositoryId, issue);
    }
  }

  #getOrCreateStore(config: WebDavConnectionConfig) {
    const existing = this.#storesById.get(config.id);

    if (existing) {
      return existing;
    }
    const store = new WebDavWorkspaceStore({
      allowEmptyTargetInitialization: false,
      createId: this.#createId,
      transport: this.#transportFactory(config),
    });

    this.#storesById.set(config.id, store);
    return store;
  }

  async #removeConfigFile(repositoryId: string) {
    return removeWebDavConnectionConfig({
      connectionsDirectory: this.#lease.connectionsDirectory,
      onPhase: this.#onConfigRemovalPhase,
      repositoryId,
    });
  }

  #enqueueOperation<Result>(operation: () => Promise<Result>) {
    const result = this.#operationQueue.then(operation);
    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
