// SPDX-License-Identifier: GPL-3.0-or-later

import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, realpath } from "node:fs/promises";
import path from "node:path";
import {
  SystemRepositoryContractError,
  UnsupportedSystemRepositoryVersionError,
} from "../../contracts/system-repository/contractValue.ts";
import {
  createEmptySystemRepositoryContent,
  parseSystemRepositoryPurpose,
} from "../../contracts/system-repository/parseRepository.ts";
import { systemRepositoryLabel } from "../../contracts/system-repository/parseCatalog.ts";
import type {
  SystemRepositoryCatalogDto,
  SystemRepositoryDescriptorDto,
  SystemRepositoryIssueDto,
  SystemRepositoryPurposeDto,
  SystemRepositoryRetryResultDto,
} from "../../contracts/system-repository/types.ts";
import { serializeJsonIteratively } from "../../contracts/workspace-repository/json.ts";
import { hasFileSystemErrorCode } from "./fileSystemError.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
} from "./repositoryStore.ts";
import {
  FileSystemSystemRepositoryStore,
  SystemRepositoryValidationError,
  type SystemRepositoryContentValidator,
  type SystemRepositoryStore,
  type SystemRepositoryTransitionValidator,
} from "./systemRepositoryStore.ts";

const systemRepositoryDirectoryName = "system-repositories";
const purposes = ["system-journal", "system-todo"] as const satisfies
  readonly SystemRepositoryPurposeDto[];

type SystemRepositoryState =
  | { descriptor: SystemRepositoryDescriptorDto; store: SystemRepositoryStore }
  | { issue: SystemRepositoryIssueDto };

type SystemRepositoryCatalogOptions = {
  createStore?: (
    filePath: string,
    purpose: SystemRepositoryPurposeDto,
    validateContent: SystemRepositoryContentValidator,
    validateTransition: SystemRepositoryTransitionValidator,
  ) => SystemRepositoryStore;
  validateContent: SystemRepositoryContentValidator;
  validateTransition: SystemRepositoryTransitionValidator;
};

async function fsyncDirectory(directory: string) {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class SystemRepositoryCatalog {
  readonly #createStore: NonNullable<SystemRepositoryCatalogOptions["createStore"]>;
  readonly #validateContent: SystemRepositoryContentValidator;
  readonly #validateTransition: SystemRepositoryTransitionValidator;
  #initialized = false;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #stateByPurpose = new Map<SystemRepositoryPurposeDto, SystemRepositoryState>();
  readonly #stateDirectory: string;
  #systemDirectory: string;

  constructor(
    stateDirectory: string,
    {
      createStore = (
        filePath,
        purpose,
        validateContent,
        validateTransition,
      ) =>
        new FileSystemSystemRepositoryStore(
          filePath,
          purpose,
          validateContent,
          validateTransition,
        ),
      validateContent,
      validateTransition,
    }: SystemRepositoryCatalogOptions,
  ) {
    this.#stateDirectory = path.resolve(stateDirectory);
    this.#systemDirectory = path.join(
      this.#stateDirectory,
      systemRepositoryDirectoryName,
    );
    this.#createStore = createStore;
    this.#validateContent = validateContent;
    this.#validateTransition = validateTransition;
  }

  initialize() {
    return this.#enqueueOperation(async () => {
      if (this.#initialized) return;
      await this.#refreshAll(true);
      this.#initialized = true;
    });
  }

  listRepositories(): Promise<SystemRepositoryCatalogDto> {
    return this.#enqueueOperation(async () => {
      await this.#ensureInitialized();
      await this.#refreshAll(true);
      const repositories: SystemRepositoryDescriptorDto[] = [];
      const issues: SystemRepositoryIssueDto[] = [];
      for (const purpose of purposes) {
        const state = this.#stateByPurpose.get(purpose);
        if (state && "descriptor" in state) repositories.push(state.descriptor);
        else if (state) issues.push(state.issue);
      }
      return { issues, repositories };
    });
  }

  getStore(purposeValue: unknown): Promise<SystemRepositoryStore> {
    return this.#enqueueOperation(async () => {
      await this.#ensureInitialized();
      const purpose = parseSystemRepositoryPurpose(purposeValue);
      await this.#refreshPurpose(purpose, true);
      const state = this.#stateByPurpose.get(purpose);
      if (!state || "issue" in state) {
        const issue = state?.issue;
        throw new RepositoryAdapterError(
          issue?.code ?? "adapter_unavailable",
          issue?.message ?? "System repository is unavailable",
        );
      }
      return state.store;
    });
  }

  retry(purposeValue: unknown): Promise<SystemRepositoryRetryResultDto> {
    return this.#enqueueOperation(async () => {
      await this.#ensureInitialized();
      const purpose = parseSystemRepositoryPurpose(purposeValue);
      await this.#refreshPurpose(purpose, true);
      const state = this.#stateByPurpose.get(purpose);
      return { status: state && "descriptor" in state ? "ready" : "fault" };
    });
  }

  async #ensureInitialized() {
    if (this.#initialized) return;
    await this.#refreshAll(true);
    this.#initialized = true;
  }

  async #refreshAll(provisionMissing: boolean) {
    try {
      await this.#ensureSecureDirectories(provisionMissing);
    } catch (error) {
      for (const purpose of purposes) {
        this.#stateByPurpose.set(purpose, {
          issue: this.#createIssue(purpose, error, null),
        });
      }
      return;
    }
    for (const purpose of purposes) {
      await this.#refreshPurpose(purpose, provisionMissing);
    }
  }

  async #refreshPurpose(
    purpose: SystemRepositoryPurposeDto,
    provisionMissing: boolean,
  ) {
    let canonicalDirectory: string;
    try {
      await this.#ensureSecureDirectories(provisionMissing);
      canonicalDirectory = await realpath(this.#systemDirectory);
    } catch (error) {
      this.#stateByPurpose.set(purpose, {
        issue: this.#createIssue(purpose, error, null),
      });
      return;
    }
    const filePath = path.join(canonicalDirectory, `${purpose}.json`);
    try {
      const stats = await lstat(filePath).catch((error: unknown) => {
        if (hasFileSystemErrorCode(error, "ENOENT")) return null;
        throw error;
      });
      if (!stats) {
        if (!provisionMissing) {
          throw new RepositoryCorruptError("System repository file is missing");
        }
        await this.#provision(filePath, purpose);
      } else if (
        !stats.isFile() ||
        stats.isSymbolicLink() ||
        (stats.mode & 0o777) !== 0o600
      ) {
        throw new RepositoryCorruptError(
          "System repository file permissions or type are invalid",
        );
      }
      const store = this.#createStore(
        filePath,
        purpose,
        this.#validateContent,
        this.#validateTransition,
      );
      await store.loadSnapshot();
      this.#stateByPurpose.set(purpose, {
        descriptor: {
          id: purpose,
          label: systemRepositoryLabel(purpose),
          location: { serverPath: filePath, type: "server" },
          protected: true,
        },
        store,
      });
    } catch (error) {
      this.#stateByPurpose.set(purpose, {
        issue: this.#createIssue(
          purpose,
          error,
          { serverPath: filePath, type: "server" },
        ),
      });
    }
  }

  async #ensureSecureDirectories(create: boolean) {
    for (const directory of [this.#stateDirectory, this.#systemDirectory]) {
      let stats = await lstat(directory).catch((error: unknown) => {
        if (hasFileSystemErrorCode(error, "ENOENT")) return null;
        throw error;
      });
      if (!stats) {
        if (!create) throw new RepositoryCorruptError("System repository directory is missing");
        await mkdir(directory, { mode: 0o700, recursive: true });
        await chmod(directory, 0o700);
        stats = await lstat(directory);
      }
      if (!stats.isDirectory() || stats.isSymbolicLink() ||
          (stats.mode & 0o777) !== 0o700) {
        throw new RepositoryCorruptError(
          "System repository directory permissions or type are invalid",
        );
      }
    }
    this.#systemDirectory = await realpath(this.#systemDirectory);
  }

  async #provision(filePath: string, purpose: SystemRepositoryPurposeDto) {
    const content = createEmptySystemRepositoryContent(purpose);

    this.#validateContent(content);
    let handle;
    try {
      handle = await open(
        filePath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
      await handle.writeFile(
        `${serializeJsonIteratively(
          content,
          { indent: 2 },
        )}\n`,
        "utf8",
      );
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fsyncDirectory(path.dirname(filePath));
    } catch (error) {
      if (!hasFileSystemErrorCode(error, "EEXIST")) throw error;
    } finally {
      await handle?.close();
    }
  }

  #createIssue(
    purpose: SystemRepositoryPurposeDto,
    error: unknown,
    location: SystemRepositoryIssueDto["location"],
  ): SystemRepositoryIssueDto {
    const code = error instanceof UnsupportedSystemRepositoryVersionError
      ? "unsupported_repository_version"
      : error instanceof SystemRepositoryContractError ||
          error instanceof SystemRepositoryValidationError ||
          error instanceof RepositoryCorruptError ||
          error instanceof SyntaxError
        ? "repository_corrupt"
        : "adapter_unavailable";
    return {
      code,
      id: purpose,
      location,
      message: code === "unsupported_repository_version"
        ? "System repository version is not supported"
        : code === "repository_corrupt"
          ? "System repository data is corrupt"
          : "System repository storage is unavailable",
      status: "fault",
    };
  }

  #enqueueOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#operationQueue.then(operation);
    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
