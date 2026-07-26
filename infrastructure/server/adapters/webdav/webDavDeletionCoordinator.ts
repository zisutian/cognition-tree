// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  RepositoryCatalogIssueDto,
} from "../../../../contracts/workspace/types.ts";
import { RepositoryCatalogError } from "../../repository/repositoryCatalog.ts";
import type {
  ActiveWebDavConnectionConfig,
  DeletingWebDavConnectionConfig,
  WebDavConnectionConfig,
} from "./webDavConnectionConfig.ts";
import type {
  WebDavManagedDataDeletionResult,
  WebDavWorkspaceStore,
} from "./webDavWorkspaceStore.ts";

const retryDelaysMs = [
  1_000,
  2_000,
  5_000,
  10_000,
  30_000,
] as const;

export type WebDavDeletionCoordinatorOptions = {
  configsById: Map<string, WebDavConnectionConfig>;
  createId: () => string;
  forgetStore: (repositoryId: string) => void;
  getOrCreateStore: (
    config: WebDavConnectionConfig,
  ) => WebDavWorkspaceStore;
  issuesById: Map<string, RepositoryCatalogIssueDto>;
  now: () => number;
  removeConfigFile: (repositoryId: string) => Promise<boolean>;
  requestRetry: (
    repositoryId: string,
  ) => Promise<WebDavManagedDataDeletionResult>;
  writeConfig: (config: WebDavConnectionConfig) => Promise<void>;
};

export class WebDavDeletionCoordinator {
  readonly #configsById: Map<string, WebDavConnectionConfig>;
  readonly #createId: () => string;
  #disposed = false;
  readonly #forgetStore: (repositoryId: string) => void;
  readonly #getOrCreateStore: (
    config: WebDavConnectionConfig,
  ) => WebDavWorkspaceStore;
  readonly #issuesById: Map<string, RepositoryCatalogIssueDto>;
  readonly #now: () => number;
  readonly #removeConfigFile: (
    repositoryId: string,
  ) => Promise<boolean>;
  readonly #requestRetry: (
    repositoryId: string,
  ) => Promise<WebDavManagedDataDeletionResult>;
  readonly #retryTimers = new Map<string, NodeJS.Timeout>();
  readonly #scheduledRetriesInFlight = new Set<string>();
  readonly #writeConfig: (
    config: WebDavConnectionConfig,
  ) => Promise<void>;

  constructor({
    configsById,
    createId,
    forgetStore,
    getOrCreateStore,
    issuesById,
    now,
    removeConfigFile,
    requestRetry,
    writeConfig,
  }: WebDavDeletionCoordinatorOptions) {
    this.#configsById = configsById;
    this.#createId = createId;
    this.#forgetStore = forgetStore;
    this.#getOrCreateStore = getOrCreateStore;
    this.#issuesById = issuesById;
    this.#now = now;
    this.#removeConfigFile = removeConfigFile;
    this.#requestRetry = requestRetry;
    this.#writeConfig = writeConfig;
  }

  async deleteManagedData(
    repositoryId: string,
  ): Promise<WebDavManagedDataDeletionResult> {
    const config = this.#configsById.get(repositoryId);

    if (!config) {
      return { deletionToken: "", status: "deleted" };
    }
    if (config.status === "deleting-remote") {
      return this.#retryDeletingConfig(config);
    }

    return this.#beginDeletion(config);
  }

  async retryDeletion(
    repositoryId: string,
  ): Promise<WebDavManagedDataDeletionResult> {
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
    return this.#retryDeletingConfig(config);
  }

  resume(repositoryId: string) {
    this.#scheduleRetry(repositoryId, 0, true);
  }

  cancel(repositoryId: string) {
    const timer = this.#retryTimers.get(repositoryId);

    if (timer) {
      clearTimeout(timer);
      this.#retryTimers.delete(repositoryId);
    }
  }

  publishDeletingIssue(config: DeletingWebDavConnectionConfig) {
    this.#issuesById.set(config.id, {
      adapter: "webdav",
      code: "repository_busy",
      id: config.id,
      location: { type: "webdav", url: config.url },
      message: "WebDAV managed data deletion is still being completed",
      status: "deleting",
    });
  }

  dispose() {
    this.#disposed = true;
    this.#retryTimers.forEach((timer) => clearTimeout(timer));
    this.#retryTimers.clear();
  }

  async #beginDeletion(active: ActiveWebDavConnectionConfig) {
    const store = this.#getOrCreateStore(active);

    await store.closeForDeletion();

    const deleting: DeletingWebDavConnectionConfig = {
      ...active,
      deletionToken: this.#createId(),
      startedAt: new Date(this.#now()).toISOString(),
      status: "deleting-remote",
    };

    await this.#writeConfig(deleting);
    this.#configsById.set(active.id, deleting);
    this.publishDeletingIssue(deleting);

    try {
      const result = await store.deleteManagedData(
        deleting.deletionToken,
      );

      return await this.#finishOrScheduleDeletion(deleting, result);
    } catch (error) {
      await this.#writeConfig(active);
      this.#configsById.set(active.id, active);
      this.#issuesById.delete(active.id);
      this.#forgetStore(active.id);
      throw error;
    }
  }

  async #retryDeletingConfig(
    config: DeletingWebDavConnectionConfig,
  ) {
    this.cancel(config.id);
    const result = await this.#getOrCreateStore(config)
      .retryManagedDataDeletion(config.deletionToken);

    return this.#finishOrScheduleDeletion(config, result);
  }

  async #finishOrScheduleDeletion(
    config: DeletingWebDavConnectionConfig,
    result: WebDavManagedDataDeletionResult,
  ): Promise<WebDavManagedDataDeletionResult> {
    if (result.status === "deleted") {
      try {
        await this.#removeConfigFile(config.id);
      } catch {
        this.publishDeletingIssue(config);
        this.#scheduleAfterManualRetry(config.id);
        return {
          deletionToken: config.deletionToken,
          status: "deleting",
        };
      }
      this.#configsById.delete(config.id);
      this.#issuesById.delete(config.id);
      this.#forgetStore(config.id);
      return result;
    }
    this.publishDeletingIssue(config);
    this.#scheduleAfterManualRetry(config.id);
    return result;
  }

  #scheduleAfterManualRetry(repositoryId: string) {
    if (!this.#scheduledRetriesInFlight.has(repositoryId)) {
      this.#scheduleRetry(repositoryId, 0);
    }
  }

  #scheduleRetry(
    repositoryId: string,
    attempt: number,
    immediate = false,
  ) {
    if (this.#disposed || this.#retryTimers.has(repositoryId)) {
      return;
    }
    const delay = immediate
      ? 0
      : retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)];
    const timer = setTimeout(() => {
      this.#retryTimers.delete(repositoryId);
      this.#scheduledRetriesInFlight.add(repositoryId);
      void this.#requestRetry(repositoryId).then(
        (result) => {
          this.#scheduledRetriesInFlight.delete(repositoryId);
          if (result.status === "deleting") {
            this.#scheduleRetry(repositoryId, attempt + 1);
          }
        },
        () => {
          this.#scheduledRetriesInFlight.delete(repositoryId);
          this.#scheduleRetry(repositoryId, attempt + 1);
        },
      );
    }, delay);

    timer.unref();
    this.#retryTimers.set(repositoryId, timer);
  }
}
