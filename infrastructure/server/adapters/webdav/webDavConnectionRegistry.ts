// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import { parsePortableName } from "../../../../core/naming/portableName.ts";
import type {
  RepositoryAuthenticationDto,
  RepositoryCatalogIssueDto,
  RepositoryDescriptorDto,
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace/types.ts";
import { RepositoryCatalogError } from "../../repository/repositoryCatalog.ts";
import type { WorkspaceRepositoryStore } from "../../repository/repositoryStore.ts";
import { hasFileSystemErrorCode } from "../../persistence/fileSystemError.ts";
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
  parseWebDavConnectionConfig,
  webDavConnectionConfigVersion,
  type ActiveWebDavConnectionConfig,
  type DeletingWebDavConnectionConfig,
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

const registryLockFileName = ".ctn-webdav-registry.lock";
const connectionsDirectoryName = "webdav-connections";
const retryDelaysMs = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

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
  #connectionsDirectory: string;
  #disposed = false;
  #initializePromise: Promise<void> | null = null;
  readonly #issuesById = new Map<string, RepositoryCatalogIssueDto>();
  #lockCompromised = false;
  readonly #now: () => number;
  readonly #onConfigRemovalPhase: NonNullable<
    WebDavConnectionRegistryOptions["onConfigRemovalPhase"]
  >;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #privateTargetPolicy: WebDavPrivateTargetPolicy;
  #releaseLock: (() => Promise<void>) | null = null;
  readonly #retryTimers = new Map<string, NodeJS.Timeout>();
  #stateDirectory: string;
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
    this.#connectionsDirectory = path.join(
      path.resolve(stateDirectory),
      connectionsDirectoryName,
    );
    this.#createId = createId;
    this.#now = now;
    this.#onConfigRemovalPhase = onConfigRemovalPhase;
    this.#privateTargetPolicy = privateTargetPolicy;
    this.#stateDirectory = path.resolve(stateDirectory);
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
    this.#disposed = true;
    this.#retryTimers.forEach((timer) => clearTimeout(timer));
    this.#retryTimers.clear();
    await this.#operationQueue;
    await Promise.all(
      [...this.#storesById.values()].map((store) => store.closeForDeletion()),
    );
    this.#storesById.clear();
    const release = this.#releaseLock;

    this.#releaseLock = null;
    this.#initializePromise = null;
    if (release) {
      await release();
    }
  }

  async listEntries(): Promise<WebDavConnectionRegistryEntries> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#assertLock();
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
      this.#assertLock();
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
      this.#assertLock();
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
          this.#connectionsDirectory,
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
      await writeWebDavConnectionConfig(this.#connectionsDirectory, config);
      this.#configsById.set(config.id, config);
      this.#storesById.set(config.id, store);
      return createDescriptor(config);
    });
  }

  async removeConnection(repositoryId: string): Promise<boolean> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#assertLock();
      this.#cancelRetry(repositoryId);
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
      this.#assertLock();
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

      await writeWebDavConnectionConfig(this.#connectionsDirectory, renamed);
      this.#configsById.set(repositoryId, renamed);
      return createDescriptor(renamed);
    });
  }

  async deleteManagedData(
    repositoryId: string,
  ): Promise<WebDavManagedDataDeletionResult> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#assertLock();
      const active = this.#configsById.get(repositoryId);

      if (!active) {
        return { deletionToken: "", status: "deleted" };
      }
      if (active.status === "deleting-remote") {
        return this.#retryDeletion(active);
      }

      const store = this.#getOrCreateStore(active);

      await store.closeForDeletion();

      const deleting: DeletingWebDavConnectionConfig = {
        ...active,
        deletionToken: this.#createId(),
        startedAt: new Date(this.#now()).toISOString(),
        status: "deleting-remote",
      };

      await writeWebDavConnectionConfig(this.#connectionsDirectory, deleting);
      this.#configsById.set(repositoryId, deleting);
      this.#publishDeletingIssue(deleting);

      try {
        const result = await store.deleteManagedData(deleting.deletionToken);

        return await this.#finishOrScheduleDeletion(deleting, result);
      } catch (error) {
        await writeWebDavConnectionConfig(this.#connectionsDirectory, active);
        this.#configsById.set(repositoryId, active);
        this.#issuesById.delete(repositoryId);
        this.#storesById.delete(repositoryId);
        throw error;
      }
    });
  }

  async retryDeletion(
    repositoryId: string,
  ): Promise<WebDavManagedDataDeletionResult> {
    return this.#enqueueOperation(async () => {
      await this.initialize();
      this.#assertLock();
      const config = this.#configsById.get(repositoryId);

      if (!config) {
        return { deletionToken: "", status: "deleted" };
      }
      if (config.status !== "deleting-remote") {
        throw new RepositoryCatalogError(
          "invalid_request",
          "WebDAV repository is not pending deletion",
        );
      }
      return this.#retryDeletion(config);
    });
  }

  hasEntry(repositoryId: string) {
    return this.#configsById.has(repositoryId) || this.#issuesById.has(repositoryId);
  }

  async #initialize() {
    await this.#createSecureDirectory(this.#stateDirectory);
    this.#stateDirectory = await realpath(this.#stateDirectory);
    this.#connectionsDirectory = path.join(
      this.#stateDirectory,
      connectionsDirectoryName,
    );
    await this.#createSecureDirectory(this.#connectionsDirectory);

    try {
      this.#releaseLock = await lock(this.#stateDirectory, {
        lockfilePath: path.join(this.#stateDirectory, registryLockFileName),
        onCompromised: () => {
          this.#lockCompromised = true;
        },
        realpath: true,
        retries: 0,
        stale: 30_000,
        update: 10_000,
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ELOCKED") {
        throw new RepositoryCatalogError(
          "repository_busy",
          "WebDAV registry is already owned by another server",
        );
      }
      throw error;
    }

    try {
      await cleanInterruptedWebDavConnectionFiles(this.#connectionsDirectory);
      await this.#loadConnections();
      [...this.#configsById.values()]
        .filter((config): config is DeletingWebDavConnectionConfig =>
          config.status === "deleting-remote")
        .forEach((config) => this.#scheduleRetry(config.id, 0, true));
    } catch (error) {
      const release = this.#releaseLock;

      this.#releaseLock = null;
      if (release) {
        await release().catch(() => undefined);
      }
      throw error;
    }
  }

  async #createSecureDirectory(directory: string) {
    const existing = await lstat(directory).catch((error: unknown) => {
      if (hasFileSystemErrorCode(error, "ENOENT")) {
        return null;
      }
      throw error;
    });

    if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) {
      throw new Error("WebDAV registry path is not a real directory");
    }
    if (existing) {
      if ((existing.mode & 0o777) !== 0o700) {
        throw new Error("WebDAV registry directory permissions are invalid");
      }
      return;
    }
    await mkdir(directory, { mode: 0o700, recursive: true });
    await chmod(directory, 0o700);
  }

  async #loadConnections() {
    const { configs, issues } = await loadWebDavConnectionConfigs(
      this.#connectionsDirectory,
    );

    this.#configsById.clear();
    this.#issuesById.clear();
    configs.forEach((config, repositoryId) => {
      this.#configsById.set(repositoryId, config);
      if (config.status === "deleting-remote") {
        this.#publishDeletingIssue(config);
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

  async #retryDeletion(config: DeletingWebDavConnectionConfig) {
    this.#cancelRetry(config.id);
    const result = await this.#getOrCreateStore(config)
      .retryManagedDataDeletion(config.deletionToken);

    return this.#finishOrScheduleDeletion(config, result);
  }

  async #finishOrScheduleDeletion(
    config: DeletingWebDavConnectionConfig,
    result: WebDavManagedDataDeletionResult,
  ) {
    if (result.status === "deleted") {
      try {
        await this.#removeConfigFile(config.id);
      } catch {
        this.#publishDeletingIssue(config);
        this.#scheduleRetry(config.id, 0);
        return {
          deletionToken: config.deletionToken,
          status: "deleting" as const,
        };
      }
      this.#configsById.delete(config.id);
      this.#issuesById.delete(config.id);
      this.#storesById.delete(config.id);
      return result;
    }
    this.#publishDeletingIssue(config);
    this.#scheduleRetry(config.id, 0);
    return result;
  }

  #scheduleRetry(repositoryId: string, attempt: number, immediate = false) {
    if (this.#disposed || this.#retryTimers.has(repositoryId)) {
      return;
    }
    const delay = immediate
      ? 0
      : retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)];
    const timer = setTimeout(() => {
      this.#retryTimers.delete(repositoryId);
      void this.retryDeletion(repositoryId).then(
        (result) => {
          if (result.status === "deleting") {
            this.#scheduleRetry(repositoryId, attempt + 1);
          }
        },
        () => this.#scheduleRetry(repositoryId, attempt + 1),
      );
    }, delay);

    timer.unref();
    this.#retryTimers.set(repositoryId, timer);
  }

  #cancelRetry(repositoryId: string) {
    const timer = this.#retryTimers.get(repositoryId);

    if (timer) {
      clearTimeout(timer);
      this.#retryTimers.delete(repositoryId);
    }
  }

  #publishDeletingIssue(config: DeletingWebDavConnectionConfig) {
    this.#issuesById.set(config.id, {
      adapter: "webdav",
      code: "repository_busy",
      id: config.id,
      location: { type: "webdav", url: config.url },
      message: "WebDAV managed data deletion is still being completed",
      status: "deleting",
    });
  }

  async #removeConfigFile(repositoryId: string) {
    return removeWebDavConnectionConfig({
      connectionsDirectory: this.#connectionsDirectory,
      onPhase: this.#onConfigRemovalPhase,
      repositoryId,
    });
  }

  #assertLock() {
    if (this.#lockCompromised || !this.#releaseLock) {
      throw new RepositoryCatalogError(
        "repository_busy",
        "WebDAV registry writer lock was lost",
      );
    }
  }

  #enqueueOperation<Result>(operation: () => Promise<Result>) {
    const result = this.#operationQueue.then(operation);
    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
