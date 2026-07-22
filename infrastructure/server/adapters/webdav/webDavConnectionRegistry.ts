// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import { isRepositoryId } from "../../../../contracts/workspace/parseCatalog.ts";
import { parsePortableName } from "../../../../core/naming/portableName.ts";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
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
  fsyncDirectory,
  replaceFileDurably,
} from "../../persistence/fileSystemPersistence.ts";
import {
  createWebDavTransport,
  normalizeWebDavBaseUrl,
  probeWebDavCapabilities,
  type WebDavTransport,
} from "./webDavTransport.ts";
import type { WebDavPrivateTargetPolicy } from "./webDavTargetPolicy.ts";
import { parseWebDavPrivateTargets } from "./webDavTargetPolicy.ts";
import {
  WebDavWorkspaceStore,
  type WebDavManagedDataDeletionResult,
} from "./webDavWorkspaceStore.ts";

const registrySchemaVersion = 1 as const;
const registryLockFileName = ".ctn-webdav-registry.lock";
const connectionsDirectoryName = "webdav-connections";
const temporaryFilePattern = /\.json\.\d+\.[0-9a-f-]+\.tmp$/i;
const deletionFilePattern = /^\.delete-.+-[0-9a-f-]+$/i;
const retryDelaysMs = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

export const webDavRegistryConfigRemovalPhases = {
  beforeRename: "before-rename",
  cleanupCompleted: "cleanup-completed",
  renamed: "renamed",
} as const;

export type WebDavRegistryConfigRemovalPhase =
  typeof webDavRegistryConfigRemovalPhases[
    keyof typeof webDavRegistryConfigRemovalPhases
  ];

type ActiveConnectionConfig = {
  authentication: RepositoryAuthenticationDto;
  id: string;
  label: string;
  schemaVersion: typeof registrySchemaVersion;
  status: "active";
  url: string;
};

type DeletingConnectionConfig = Omit<ActiveConnectionConfig, "status"> & {
  deletionToken: string;
  startedAt: string;
  status: "deleting-remote";
};

export type WebDavConnectionConfig =
  | ActiveConnectionConfig
  | DeletingConnectionConfig;

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

const activeFields = new Set([
  "authentication",
  "id",
  "label",
  "schemaVersion",
  "status",
  "url",
]);
const deletingFields = new Set([
  ...activeFields,
  "deletionToken",
  "startedAt",
]);

function assertExactFields(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
) {
  if (
    Object.keys(value).some((field) => !expected.has(field)) ||
    [...expected].some((field) => !(field in value))
  ) {
    throw new Error("WebDAV connection has invalid fields");
  }
}

function parseAuthentication(value: unknown): RepositoryAuthenticationDto {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("WebDAV connection authentication is invalid");
  }
  const authentication = value as Record<string, unknown>;

  if (authentication.type === "none") {
    assertExactFields(authentication, new Set(["type"]));
    return { type: "none" };
  }
  if (authentication.type === "basic") {
    assertExactFields(
      authentication,
      new Set(["password", "type", "username"]),
    );
    if (
      typeof authentication.username !== "string" ||
      authentication.username.length === 0 ||
      typeof authentication.password !== "string" ||
      authentication.password.length === 0
    ) {
      throw new Error("WebDAV basic authentication is invalid");
    }
    return {
      password: authentication.password,
      type: "basic",
      username: authentication.username,
    };
  }
  throw new Error("WebDAV connection authentication is invalid");
}

export function parseWebDavConnectionConfig(
  source: string,
  expectedId?: string,
): WebDavConnectionConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("WebDAV connection JSON is invalid");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("WebDAV connection is invalid");
  }
  const value = parsed as Record<string, unknown>;

  if (value.schemaVersion !== registrySchemaVersion) {
    throw new Error("WebDAV connection version is unsupported");
  }
  if (value.status !== "active" && value.status !== "deleting-remote") {
    throw new Error("WebDAV connection status is invalid");
  }
  assertExactFields(
    value,
    value.status === "active" ? activeFields : deletingFields,
  );
  if (
    typeof value.id !== "string" ||
    !isRepositoryId(value.id) ||
    (expectedId !== undefined && value.id !== expectedId) ||
    typeof value.label !== "string" ||
    value.label.trim() === "" ||
    typeof value.url !== "string"
  ) {
    throw new Error("WebDAV connection identity is invalid");
  }
  const authentication = parseAuthentication(value.authentication);
  const url = normalizeWebDavBaseUrl(value.url);

  if (authentication.type === "basic" && url.protocol !== "https:") {
    throw new Error("Authenticated WebDAV connections require HTTPS");
  }
  const base = {
    authentication,
    id: value.id,
    label: value.label,
    schemaVersion: registrySchemaVersion,
    url: url.toString(),
  };

  if (value.status === "active") {
    return { ...base, status: "active" };
  }
  if (
    typeof value.deletionToken !== "string" ||
    value.deletionToken.length === 0 ||
    typeof value.startedAt !== "string" ||
    !Number.isFinite(Date.parse(value.startedAt))
  ) {
    throw new Error("WebDAV deletion state is invalid");
  }
  return {
    ...base,
    deletionToken: value.deletionToken,
    startedAt: value.startedAt,
    status: "deleting-remote",
  };
}

function stringifyConfig(config: WebDavConnectionConfig) {
  return `${serializeJsonIteratively(config, { indent: 2 })}\n`;
}

async function writeConfigAtomically(
  filePath: string,
  config: WebDavConnectionConfig,
) {
  await replaceFileDurably(filePath, stringifyConfig(config));
}

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
          .filter((config): config is ActiveConnectionConfig =>
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
        schemaVersion: registrySchemaVersion,
        status: "active",
        url: input.url,
      }));

      if (
        this.#configsById.has(config.id) ||
        this.#issuesById.has(config.id) ||
        await this.#pathExists(this.#connectionPath(config.id))
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
      await writeConfigAtomically(this.#connectionPath(config.id), config);
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

      await writeConfigAtomically(this.#connectionPath(repositoryId), renamed);
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

      const deleting: DeletingConnectionConfig = {
        ...active,
        deletionToken: this.#createId(),
        startedAt: new Date(this.#now()).toISOString(),
        status: "deleting-remote",
      };

      await writeConfigAtomically(this.#connectionPath(repositoryId), deleting);
      this.#configsById.set(repositoryId, deleting);
      this.#publishDeletingIssue(deleting);

      try {
        const result = await store.deleteManagedData(deleting.deletionToken);

        return await this.#finishOrScheduleDeletion(deleting, result);
      } catch (error) {
        await writeConfigAtomically(this.#connectionPath(repositoryId), active);
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
      await this.#cleanInterruptedFiles();
      await this.#loadConnections();
      [...this.#configsById.values()]
        .filter((config): config is DeletingConnectionConfig =>
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

  async #cleanInterruptedFiles() {
    const entries = await readdir(this.#connectionsDirectory, {
      withFileTypes: true,
    });
    let changed = false;

    for (const entry of entries) {
      if (
        (entry.isFile() || entry.isSymbolicLink()) &&
        (temporaryFilePattern.test(entry.name) || deletionFilePattern.test(entry.name))
      ) {
        await rm(path.join(this.#connectionsDirectory, entry.name), {
          force: true,
        });
        changed = true;
      }
    }
    if (changed) {
      await fsyncDirectory(this.#connectionsDirectory);
    }
  }

  async #loadConnections() {
    this.#configsById.clear();
    this.#issuesById.clear();
    const entries = await readdir(this.#connectionsDirectory, {
      withFileTypes: true,
    });
    const configEntries = entries
      .filter((entry) => entry.name.endsWith(".json"))
      .sort((left, right) => left.name.localeCompare(right.name));
    const urls = new Set<string>();

    for (const entry of configEntries) {
      const repositoryId = entry.name.slice(0, -".json".length);

      if (!isRepositoryId(repositoryId)) {
        throw new Error("WebDAV registry contains an invalid connection file name");
      }
      try {
        if (!entry.isFile() || entry.isSymbolicLink()) {
          throw new Error("WebDAV connection is not a regular file");
        }
        const filePath = this.#connectionPath(repositoryId);
        const stats = await lstat(filePath);

        if ((stats.mode & 0o077) !== 0) {
          throw new Error("WebDAV connection permissions are too broad");
        }
        const config = parseWebDavConnectionConfig(
          await readFile(filePath, "utf8"),
          repositoryId,
        );

        if (urls.has(config.url)) {
          throw new Error("Duplicate WebDAV target");
        }
        urls.add(config.url);
        this.#configsById.set(repositoryId, config);
        if (config.status === "deleting-remote") {
          this.#publishDeletingIssue(config);
        }
      } catch {
        this.#issuesById.set(repositoryId, {
          adapter: "webdav",
          code: "repository_corrupt",
          id: repositoryId,
          location: null,
          message: "WebDAV connection configuration is invalid",
          status: "fault",
        });
      }
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

  async #retryDeletion(config: DeletingConnectionConfig) {
    this.#cancelRetry(config.id);
    const result = await this.#getOrCreateStore(config)
      .retryManagedDataDeletion(config.deletionToken);

    return this.#finishOrScheduleDeletion(config, result);
  }

  async #finishOrScheduleDeletion(
    config: DeletingConnectionConfig,
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

  #publishDeletingIssue(config: DeletingConnectionConfig) {
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
    if (!isRepositoryId(repositoryId)) {
      throw new RepositoryCatalogError(
        "invalid_request",
        `Invalid repository id: ${repositoryId}`,
      );
    }
    const filePath = this.#connectionPath(repositoryId);
    const deletionPath = path.join(
      this.#connectionsDirectory,
      `.delete-${repositoryId}-${randomUUID()}`,
    );

    try {
      await this.#onConfigRemovalPhase(
        webDavRegistryConfigRemovalPhases.beforeRename,
      );
      await rename(filePath, deletionPath);
    } catch (error) {
      if (hasFileSystemErrorCode(error, "ENOENT")) {
        return false;
      }
      throw error;
    }
    // The rename is the configuration deletion commit point. Every operation
    // after it is recoverable maintenance and cannot truthfully turn a
    // committed removal back into an active connection.
    await Promise.resolve()
      .then(() => this.#onConfigRemovalPhase(
        webDavRegistryConfigRemovalPhases.renamed,
      ))
      .catch(() => undefined);
    await fsyncDirectory(this.#connectionsDirectory).catch(() => undefined);
    await rm(deletionPath, { force: true }).catch(() => undefined);
    await fsyncDirectory(this.#connectionsDirectory).catch(() => undefined);
    await Promise.resolve()
      .then(() => this.#onConfigRemovalPhase(
        webDavRegistryConfigRemovalPhases.cleanupCompleted,
      ))
      .catch(() => undefined);
    return true;
  }

  #connectionPath(repositoryId: string) {
    if (!isRepositoryId(repositoryId)) {
      throw new RepositoryCatalogError(
        "invalid_request",
        `Invalid repository id: ${repositoryId}`,
      );
    }
    return path.join(this.#connectionsDirectory, `${repositoryId}.json`);
  }

  async #pathExists(filePath: string) {
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
