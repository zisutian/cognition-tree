// SPDX-License-Identifier: GPL-3.0-or-later

import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import {
  WireContractError,
  UnsupportedWireVersionError,
} from "../../../../contracts/common/contractValue.ts";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import { builtInLabel, parseBuiltInId } from "../../../../contracts/built-ins/parseBuiltIns.ts";
import type {
  BuiltInCatalogDto,
  BuiltInDescriptorDto,
  BuiltInIdDto,
  BuiltInIssueDto,
  BuiltInRetryResultDto,
} from "../../../../contracts/built-ins/types.ts";
import { journalStorageEpoch } from "../../../../contracts/journal/storageEpoch.ts";
import type { JournalContentDto } from "../../../../contracts/journal/types.ts";
import type { JournalParseIndex } from "../../../../core/journal/indexes/journalParseIndex.ts";
import { createEmptyJournalContent } from "../../../../core/journal/model/journalContent.ts";
import { createEmptyTodoContent } from "../../../../core/todo/model/todoContent.ts";
import { todoStorageEpoch } from "../../../../contracts/todo/storageEpoch.ts";
import type { TodoContentDto } from "../../../../contracts/todo/types.ts";
import type { TodoParseIndex } from "../../../../core/todo/indexes/todoParseIndex.ts";
import { hasFileSystemErrorCode } from "../../persistence/fileSystemError.ts";
import {
  isSecureDirectory,
  isSecureRegularFile,
  readFileHandleUtf8,
  replaceFileDurably,
} from "../../persistence/fileSystemPersistence.ts";
import {
  createFileSystemJournalContentStore,
} from "./journalStore.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
} from "../store.ts";
import {
  createFileSystemTodoContentStore,
} from "./todoStore.ts";
import type { VersionedContentStore } from "../versioned/contentStore.ts";

const builtInsDirectoryName = ".built-ins";
const contentFileName = "content.json";
const epochFileName = "storage.epoch";

type BuiltInDefinition<Content, Projection> = {
  createEmptyContent(): Content;
  createStore(filePath: string): VersionedContentStore<Content, Projection>;
  epoch: number;
  id: BuiltInIdDto;
};

type AnyBuiltInDefinition =
  | BuiltInDefinition<JournalContentDto, JournalParseIndex>
  | BuiltInDefinition<TodoContentDto, TodoParseIndex>;

type BuiltInState =
  | {
      descriptor: BuiltInDescriptorDto;
      store: VersionedContentStore<unknown, unknown>;
    }
  | { issue: BuiltInIssueDto };

export type BuiltInCatalogOptions = {
  journalDefinition?: BuiltInDefinition<JournalContentDto, JournalParseIndex>;
  todoDefinition?: BuiltInDefinition<TodoContentDto, TodoParseIndex>;
};

const defaultJournalDefinition: BuiltInDefinition<
  JournalContentDto,
  JournalParseIndex
> = {
  createEmptyContent: createEmptyJournalContent,
  createStore: createFileSystemJournalContentStore,
  epoch: journalStorageEpoch,
  id: "journal",
};

const defaultTodoDefinition: BuiltInDefinition<TodoContentDto, TodoParseIndex> = {
  createEmptyContent: createEmptyTodoContent,
  createStore: createFileSystemTodoContentStore,
  epoch: todoStorageEpoch,
  id: "todo",
};

export class BuiltInCatalog {
  #builtInsDirectory: string;
  readonly #definitions: readonly AnyBuiltInDefinition[];
  #initialized = false;
  #operationQueue: Promise<void> = Promise.resolve();
  #repositoryRootDirectory: string;
  readonly #stateById = new Map<BuiltInIdDto, BuiltInState>();

  constructor(
    repositoryRootDirectory: string,
    {
      journalDefinition = defaultJournalDefinition,
      todoDefinition = defaultTodoDefinition,
    }: BuiltInCatalogOptions = {},
  ) {
    this.#repositoryRootDirectory = path.resolve(repositoryRootDirectory);
    this.#builtInsDirectory = path.join(
      this.#repositoryRootDirectory,
      builtInsDirectoryName,
    );
    this.#definitions = [journalDefinition, todoDefinition];
  }

  initialize() {
    return this.#enqueue(async () => {
      if (this.#initialized) return;
      await this.#refreshAll(true);
      this.#initialized = true;
    });
  }

  listBuiltIns(): Promise<BuiltInCatalogDto> {
    return this.#enqueue(async () => {
      await this.#ensureInitialized();
      await this.#refreshAll(true);
      const repositories: BuiltInDescriptorDto[] = [];
      const issues: BuiltInIssueDto[] = [];

      for (const definition of this.#definitions) {
        const state = this.#stateById.get(definition.id);

        if (state && "descriptor" in state) repositories.push(state.descriptor);
        else if (state) issues.push(state.issue);
      }
      return { issues, repositories };
    });
  }

  getStore(idValue: "journal"): Promise<
    VersionedContentStore<JournalContentDto, JournalParseIndex>
  >;
  getStore(idValue: "todo"): Promise<
    VersionedContentStore<TodoContentDto, TodoParseIndex>
  >;
  getStore(idValue: BuiltInIdDto): Promise<
    VersionedContentStore<unknown, unknown>
  >;
  getStore(idValue: BuiltInIdDto): Promise<
    VersionedContentStore<unknown, unknown>
  > {
    return this.#getStore(parseBuiltInId(idValue));
  }

  retry(idValue: unknown): Promise<BuiltInRetryResultDto> {
    return this.#enqueue(async () => {
      await this.#ensureInitialized();
      const id = parseBuiltInId(idValue);
      const definition = this.#requireDefinition(id);

      await this.#refreshDefinition(definition, true);
      const state = this.#stateById.get(id);
      return { status: state && "descriptor" in state ? "ready" : "fault" };
    });
  }

  #getStore(
    id: BuiltInIdDto,
  ): Promise<VersionedContentStore<unknown, unknown>> {
    return this.#enqueue(async () => {
      await this.#ensureInitialized();
      const definition = this.#requireDefinition(id);

      await this.#refreshDefinition(definition, true);
      const state = this.#stateById.get(id);
      if (!state || "issue" in state) {
        throw new RepositoryAdapterError(
          state?.issue.code ?? "adapter_unavailable",
          state?.issue.message ?? "Built-in data is unavailable",
        );
      }
      return state.store;
    });
  }

  #requireDefinition(id: BuiltInIdDto) {
    const definition = this.#definitions.find((candidate) => candidate.id === id);

    if (!definition) throw new Error(`Missing built-in definition: ${id}`);
    return definition;
  }

  async #ensureInitialized() {
    if (this.#initialized) return;
    await this.#refreshAll(true);
    this.#initialized = true;
  }

  async #refreshAll(provision: boolean) {
    try {
      await this.#ensureRepositoryRoot(provision);
      await this.#ensureDirectory(this.#builtInsDirectory, provision);
    } catch (error) {
      for (const definition of this.#definitions) {
        this.#stateById.set(definition.id, {
          issue: this.#createIssue(definition.id, error, null),
        });
      }
      return;
    }
    for (const definition of this.#definitions) {
      await this.#refreshDefinition(definition, provision);
    }
  }

  async #refreshDefinition(
    definition: AnyBuiltInDefinition,
    provision: boolean,
  ) {
    const directory = path.join(this.#builtInsDirectory, definition.id);
    const contentPath = path.join(directory, contentFileName);

    try {
      await this.#ensureDirectory(this.#builtInsDirectory, provision);
      await this.#ensureDirectory(directory, provision);
      const canonicalDirectory = await realpath(directory);
      const canonicalContentPath = path.join(canonicalDirectory, contentFileName);
      const canonicalEpochPath = path.join(canonicalDirectory, epochFileName);

      await this.#ensureEpoch(
        definition,
        canonicalContentPath,
        canonicalEpochPath,
        provision,
      );
      const stats = await lstat(canonicalContentPath).catch((error: unknown) => {
        if (hasFileSystemErrorCode(error, "ENOENT")) return null;
        throw error;
      });
      if (
        !stats ||
        !isSecureRegularFile(stats)
      ) {
        throw new RepositoryCorruptError(
          "Built-in content file permissions or type are invalid",
        );
      }
      const store = definition.createStore(canonicalContentPath) as
        VersionedContentStore<unknown, unknown>;

      await store.loadSnapshot();
      this.#stateById.set(definition.id, {
        descriptor: {
          id: definition.id,
          label: builtInLabel(definition.id),
          location: { serverPath: canonicalContentPath, type: "server" },
          protected: true,
        },
        store,
      });
    } catch (error) {
      this.#stateById.set(definition.id, {
        issue: this.#createIssue(
          definition.id,
          error,
          { serverPath: contentPath, type: "server" },
        ),
      });
    }
  }

  async #ensureDirectory(directory: string, create: boolean) {
    let stats = await lstat(directory).catch((error: unknown) => {
      if (hasFileSystemErrorCode(error, "ENOENT")) return null;
      throw error;
    });

    if (!stats) {
      if (!create) throw new RepositoryCorruptError("Built-in data directory is missing");
      await mkdir(directory, { mode: 0o700, recursive: true });
      await chmod(directory, 0o700);
      stats = await lstat(directory);
    }
    if (
      !isSecureDirectory(stats)
    ) {
      throw new RepositoryCorruptError(
        "Built-in data directory permissions or type are invalid",
      );
    }
  }

  async #ensureRepositoryRoot(create: boolean) {
    let stats = await lstat(this.#repositoryRootDirectory).catch(
      (error: unknown) => {
        if (hasFileSystemErrorCode(error, "ENOENT")) return null;
        throw error;
      },
    );

    if (!stats) {
      if (!create) {
        throw new RepositoryCorruptError("Repository root directory is missing");
      }
      await mkdir(this.#repositoryRootDirectory, { recursive: true });
      stats = await lstat(this.#repositoryRootDirectory);
    }
    if (!stats.isDirectory()) {
      throw new RepositoryCorruptError("Repository root is not a directory");
    }
    this.#repositoryRootDirectory = await realpath(
      this.#repositoryRootDirectory,
    );
    this.#builtInsDirectory = path.join(
      this.#repositoryRootDirectory,
      builtInsDirectoryName,
    );
  }

  async #ensureEpoch(
    definition: AnyBuiltInDefinition,
    contentPath: string,
    epochPath: string,
    provision: boolean,
  ) {
    const storedEpoch = await this.#readEpoch(epochPath);

    if (storedEpoch === definition.epoch) return;
    if (storedEpoch !== null) {
      throw new UnsupportedWireVersionError(
        `${builtInLabel(definition.id)} storage`,
        "$.storageEpoch",
        storedEpoch,
      );
    }
    if (!provision) {
      throw new RepositoryCorruptError("Built-in storage epoch does not match");
    }
    const contentStats = await lstat(contentPath).catch((error: unknown) => {
      if (hasFileSystemErrorCode(error, "ENOENT")) return null;
      throw error;
    });

    if (contentStats !== null) {
      throw new RepositoryCorruptError(
        "Built-in storage has content without an epoch",
      );
    }
    await replaceFileDurably(
      contentPath,
      `${serializeJsonIteratively(definition.createEmptyContent(), { indent: 2 })}\n`,
      { hiddenTemporaryFile: true },
    );
    await replaceFileDurably(epochPath, `${definition.epoch}\n`, {
      hiddenTemporaryFile: true,
    });
  }

  async #readEpoch(epochPath: string): Promise<number | null> {
    let handle;

    try {
      handle = await open(
        epochPath,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      );
      const stats = await handle.stat();
      if (!isSecureRegularFile(stats)) {
        throw new RepositoryCorruptError("Built-in storage epoch file is invalid");
      }
      const source = await readFileHandleUtf8(
        handle,
        32,
        "Built-in storage epoch file",
      );
      if (!/^[1-9][0-9]*\n$/.test(source)) {
        throw new RepositoryCorruptError("Built-in storage epoch is invalid");
      }
      const epoch = Number(source.slice(0, -1));
      if (!Number.isSafeInteger(epoch)) {
        throw new RepositoryCorruptError("Built-in storage epoch is invalid");
      }
      return epoch;
    } catch (error) {
      if (hasFileSystemErrorCode(error, "ENOENT")) return null;
      if (hasFileSystemErrorCode(error, "ELOOP")) {
        throw new RepositoryCorruptError("Built-in storage epoch is a symbolic link");
      }
      throw error;
    } finally {
      await handle?.close();
    }
  }

  #createIssue(
    id: BuiltInIdDto,
    error: unknown,
    location: BuiltInIssueDto["location"],
  ): BuiltInIssueDto {
    const code = error instanceof UnsupportedWireVersionError
      ? "unsupported_repository_version"
      : error instanceof WireContractError ||
          error instanceof RepositoryCorruptError ||
          error instanceof SyntaxError
        ? "repository_corrupt"
        : "adapter_unavailable";

    return {
      code,
      id,
      location,
      message: code === "unsupported_repository_version"
        ? `${builtInLabel(id)}数据版本不受支持`
        : code === "repository_corrupt"
          ? `${builtInLabel(id)}数据已损坏`
          : `${builtInLabel(id)}存储不可用`,
      status: "fault",
    };
  }

  #enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#operationQueue.then(operation);

    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
