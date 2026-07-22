// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import {
  WireContractError,
  UnsupportedWireVersionError,
} from "../../../contracts/common/contractValue.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import { builtInLabel, parseBuiltInId } from "../../../contracts/built-ins/parseBuiltIns.ts";
import type {
  BuiltInCatalogDto,
  BuiltInDescriptorDto,
  BuiltInIdDto,
  BuiltInIssueDto,
  BuiltInRetryResultDto,
} from "../../../contracts/built-ins/types.ts";
import { createEmptyJournalContent } from "../../../contracts/journal/parseJournal.ts";
import { journalStorageEpoch } from "../../../contracts/journal/storageEpoch.ts";
import type { JournalContentDto } from "../../../contracts/journal/types.ts";
import { createEmptyTodoContent } from "../../../contracts/todo/parseTodo.ts";
import { todoStorageEpoch } from "../../../contracts/todo/storageEpoch.ts";
import type { TodoContentDto } from "../../../contracts/todo/types.ts";
import { hasFileSystemErrorCode } from "./fileSystemError.ts";
import {
  createFileSystemJournalContentStore,
} from "./journalContentStore.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
} from "./repositoryStore.ts";
import {
  createFileSystemTodoContentStore,
} from "./todoContentStore.ts";
import type { VersionedContentStore } from "./versionedContentStore.ts";

const builtInsDirectoryName = "built-ins";
const contentFileName = "content.json";
const epochFileName = "storage.epoch";

type BuiltInDefinition<Content> = {
  createEmptyContent(): Content;
  createStore(filePath: string): VersionedContentStore<Content>;
  epoch: number;
  id: BuiltInIdDto;
  oldPurpose: "system-journal" | "system-todo";
};

type AnyBuiltInDefinition =
  | BuiltInDefinition<JournalContentDto>
  | BuiltInDefinition<TodoContentDto>;

type BuiltInState =
  | { descriptor: BuiltInDescriptorDto; store: VersionedContentStore<unknown> }
  | { issue: BuiltInIssueDto };

export type BuiltInCatalogOptions = {
  journalDefinition?: BuiltInDefinition<JournalContentDto>;
  todoDefinition?: BuiltInDefinition<TodoContentDto>;
};

const defaultJournalDefinition: BuiltInDefinition<JournalContentDto> = {
  createEmptyContent: createEmptyJournalContent,
  createStore: createFileSystemJournalContentStore,
  epoch: journalStorageEpoch,
  id: "journal",
  oldPurpose: "system-journal",
};

const defaultTodoDefinition: BuiltInDefinition<TodoContentDto> = {
  createEmptyContent: createEmptyTodoContent,
  createStore: createFileSystemTodoContentStore,
  epoch: todoStorageEpoch,
  id: "todo",
  oldPurpose: "system-todo",
};

async function fsyncDirectory(directory: string) {
  const handle = await open(directory, "r");

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class BuiltInCatalog {
  readonly #builtInsDirectory: string;
  readonly #definitions: readonly AnyBuiltInDefinition[];
  #initialized = false;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #stateById = new Map<BuiltInIdDto, BuiltInState>();
  readonly #stateDirectory: string;

  constructor(
    stateDirectory: string,
    {
      journalDefinition = defaultJournalDefinition,
      todoDefinition = defaultTodoDefinition,
    }: BuiltInCatalogOptions = {},
  ) {
    this.#stateDirectory = path.resolve(stateDirectory);
    this.#builtInsDirectory = path.join(
      this.#stateDirectory,
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

  getStore(idValue: unknown): Promise<VersionedContentStore<unknown>> {
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

  #getStore(id: BuiltInIdDto): Promise<VersionedContentStore<unknown>> {
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
      await this.#ensureDirectory(this.#stateDirectory, provision);
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
      await this.#ensureDirectory(this.#stateDirectory, provision);
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
        !stats.isFile() ||
        stats.isSymbolicLink() ||
        (stats.mode & 0o777) !== 0o600
      ) {
        throw new RepositoryCorruptError(
          "Built-in content file permissions or type are invalid",
        );
      }
      const store = definition.createStore(canonicalContentPath) as
        VersionedContentStore<unknown>;

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
      !stats.isDirectory() ||
      stats.isSymbolicLink() ||
      (stats.mode & 0o777) !== 0o700
    ) {
      throw new RepositoryCorruptError(
        "Built-in data directory permissions or type are invalid",
      );
    }
  }

  async #ensureEpoch(
    definition: AnyBuiltInDefinition,
    contentPath: string,
    epochPath: string,
    provision: boolean,
  ) {
    const storedEpoch = await this.#readEpoch(epochPath);

    if (storedEpoch === definition.epoch) return;
    if (storedEpoch !== null && storedEpoch > definition.epoch) {
      throw new UnsupportedWireVersionError(
        `${builtInLabel(definition.id)} storage`,
        "$.storageEpoch",
        storedEpoch,
      );
    }
    if (!provision) {
      throw new RepositoryCorruptError("Built-in storage epoch does not match");
    }
    await this.#deleteOldSystemFiles(definition.oldPurpose);
    await this.#replaceFileAtomically(
      contentPath,
      `${serializeJsonIteratively(definition.createEmptyContent(), { indent: 2 })}\n`,
    );
    await this.#replaceFileAtomically(epochPath, `${definition.epoch}\n`);
  }

  async #deleteOldSystemFiles(oldPurpose: string) {
    const oldDirectory = path.join(this.#stateDirectory, "system-repositories");

    for (const suffix of [".json", ".epoch", ".json.lock"] as const) {
      await rm(path.join(oldDirectory, `${oldPurpose}${suffix}`), {
        force: true,
        recursive: suffix === ".json.lock",
      });
    }
  }

  async #readEpoch(epochPath: string): Promise<number | null> {
    let handle;

    try {
      handle = await open(
        epochPath,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      );
      const stats = await handle.stat();
      if (!stats.isFile() || (stats.mode & 0o777) !== 0o600) {
        throw new RepositoryCorruptError("Built-in storage epoch file is invalid");
      }
      const source = await handle.readFile("utf8");
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

  async #replaceFileAtomically(filePath: string, source: string) {
    const temporaryPath = path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let handle;

    try {
      handle = await open(
        temporaryPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
      await handle.writeFile(source, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, filePath);
      await fsyncDirectory(path.dirname(filePath));
    } finally {
      await handle?.close();
      await rm(temporaryPath, { force: true });
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
