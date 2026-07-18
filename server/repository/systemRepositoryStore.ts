// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import { serializeJsonIteratively } from "../../contracts/workspace-repository/json.ts";
import {
  SystemRepositoryContractError,
  UnsupportedSystemRepositoryVersionError,
} from "../../contracts/system-repository/contractValue.ts";
import {
  parseSystemRepositoryCommit,
  parseSystemRepositoryContent,
} from "../../contracts/system-repository/parseRepository.ts";
import { serializeSystemRepositoryRevisionContent } from "../../contracts/system-repository/revision.ts";
import type {
  SystemRepositoryCommitResultDto,
  SystemRepositoryContentDto,
  SystemRepositoryPurposeDto,
  SystemRepositoryRevisionDto,
  SystemRepositorySnapshotDto,
} from "../../contracts/system-repository/types.ts";
import {
  JournalContentValidationError,
  validateJournalContent,
  validateJournalContentTransition,
} from "../../journal/model/journalContent.ts";
import { hasFileSystemErrorCode } from "./fileSystemError.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
} from "./repositoryStore.ts";

export type SystemRepositoryStore = {
  commitSnapshot(value: unknown): Promise<SystemRepositoryCommitResultDto>;
  loadSnapshot(): Promise<SystemRepositorySnapshotDto>;
};

export type SystemRepositoryContentValidator = (
  content: SystemRepositoryContentDto,
) => void;

export type SystemRepositoryTransitionValidator = (
  previous: SystemRepositoryContentDto,
  next: SystemRepositoryContentDto,
) => void;

export class SystemRepositoryValidationError extends Error {
  cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "SystemRepositoryValidationError";
    this.cause = cause;
  }
}

export class SystemRepositoryContentValidationError
  extends SystemRepositoryValidationError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "SystemRepositoryContentValidationError";
  }
}

export class SystemRepositoryTransitionValidationError
  extends SystemRepositoryValidationError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "SystemRepositoryTransitionValidationError";
  }
}

export function validateSystemRepositoryContent(
  content: SystemRepositoryContentDto,
) {
  if (content.purpose === "system-journal") {
    try {
      validateJournalContent(content);
    } catch (error) {
      if (error instanceof JournalContentValidationError) {
        throw new SystemRepositoryContentValidationError(error.message, error);
      }
      throw error;
    }
  }
}

export function validateSystemRepositoryTransition(
  previous: SystemRepositoryContentDto,
  next: SystemRepositoryContentDto,
) {
  validateSystemRepositoryContent(previous);
  validateSystemRepositoryContent(next);
  if (previous.purpose !== next.purpose) {
    throw new SystemRepositoryTransitionValidationError(
      "System repository purpose is immutable.",
    );
  }
  if (
    previous.purpose === "system-journal" &&
    next.purpose === "system-journal"
  ) {
    try {
      validateJournalContentTransition(previous, next);
    } catch (error) {
      if (error instanceof JournalContentValidationError) {
        throw new SystemRepositoryTransitionValidationError(
          error.message,
          error,
        );
      }
      throw error;
    }
  }
}

function validateCommitBoundary(operation: () => void) {
  try {
    operation();
  } catch (error) {
    if (error instanceof SystemRepositoryValidationError) {
      throw new SystemRepositoryContractError("$.content", error.message);
    }
    throw error;
  }
}

export class SystemRepositoryRevisionConflictError extends Error {
  currentRevision: SystemRepositoryRevisionDto;

  constructor(currentRevision: SystemRepositoryRevisionDto) {
    super("System repository content changed outside the current session");
    this.name = "SystemRepositoryRevisionConflictError";
    this.currentRevision = currentRevision;
  }
}

export function createSystemRepositoryRevision(
  content: SystemRepositoryContentDto,
): SystemRepositoryRevisionDto {
  return `sha256:${createHash("sha256")
    .update(serializeSystemRepositoryRevisionContent(content))
    .digest("hex")}`;
}

async function fsyncDirectory(directory: string) {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class FileSystemSystemRepositoryStore implements SystemRepositoryStore {
  readonly #filePath: string;
  readonly #purpose: SystemRepositoryPurposeDto;
  readonly #validateContent: SystemRepositoryContentValidator;
  readonly #validateTransition: SystemRepositoryTransitionValidator;
  #operationQueue: Promise<void> = Promise.resolve();

  constructor(
    filePath: string,
    purpose: SystemRepositoryPurposeDto,
    validateContent: SystemRepositoryContentValidator,
    validateTransition: SystemRepositoryTransitionValidator,
  ) {
    this.#filePath = path.resolve(filePath);
    this.#purpose = purpose;
    this.#validateContent = validateContent;
    this.#validateTransition = validateTransition;
  }

  loadSnapshot() {
    return this.#enqueueOperation(() => this.#readSnapshot());
  }

  commitSnapshot(value: unknown) {
    const commit = parseSystemRepositoryCommit(value, this.#purpose);

    validateCommitBoundary(() => this.#validateContent(commit.content));
    return this.#enqueueOperation(async () => {
      let release: (() => Promise<void>) | null = null;
      try {
        release = await lock(this.#filePath, {
          realpath: true,
          retries: { retries: 20, factor: 1, minTimeout: 5, maxTimeout: 20 },
          stale: 30_000,
          update: 10_000,
        });
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ELOCKED") {
          throw new RepositoryAdapterError(
            "repository_busy",
            "System repository is busy",
          );
        }
        throw error;
      }
      try {
        const current = await this.#readSnapshot();
        if (current.revision !== commit.baseRevision) {
          throw new SystemRepositoryRevisionConflictError(current.revision);
        }
        validateCommitBoundary(() =>
          this.#validateTransition(current.content, commit.content)
        );
        const revision = createSystemRepositoryRevision(commit.content);
        if (revision === current.revision) return { revision };
        await this.#writeContent(commit.content);
        return { revision };
      } finally {
        await release();
      }
    });
  }

  async #readSnapshot(): Promise<SystemRepositorySnapshotDto> {
    let handle;
    try {
      handle = await open(
        this.#filePath,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      );
      const stats = await handle.stat();
      if (!stats.isFile() || (stats.mode & 0o777) !== 0o600) {
        throw new RepositoryCorruptError(
          "System repository file permissions or type are invalid",
        );
      }
      const source = await handle.readFile("utf8");
      let value: unknown;
      try {
        value = JSON.parse(source) as unknown;
      } catch {
        throw new RepositoryCorruptError("System repository JSON is invalid");
      }
      let content: SystemRepositoryContentDto;
      try {
        content = parseSystemRepositoryContent(value, this.#purpose);
        this.#validateContent(content);
      } catch (error) {
        if (error instanceof UnsupportedSystemRepositoryVersionError) {
          throw error;
        }
        if (
          error instanceof SystemRepositoryContractError ||
          error instanceof SystemRepositoryValidationError
        ) {
          throw new RepositoryCorruptError(
            "System repository content is invalid",
          );
        }
        throw error;
      }
      return { content, revision: createSystemRepositoryRevision(content) };
    } catch (error) {
      if (hasFileSystemErrorCode(error, "ENOENT")) {
        throw new RepositoryCorruptError("System repository file is missing");
      }
      if (hasFileSystemErrorCode(error, "ELOOP")) {
        throw new RepositoryCorruptError("System repository file is a symbolic link");
      }
      throw error;
    } finally {
      await handle?.close();
    }
  }

  async #writeContent(content: SystemRepositoryContentDto) {
    const temporaryPath = path.join(
      path.dirname(this.#filePath),
      `.${path.basename(this.#filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let handle;
    try {
      handle = await open(
        temporaryPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
      await handle.writeFile(
        `${serializeJsonIteratively(content, { indent: 2 })}\n`,
        "utf8",
      );
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, this.#filePath);
      await fsyncDirectory(path.dirname(this.#filePath));
    } finally {
      await handle?.close();
      await rm(temporaryPath, { force: true });
    }
  }

  #enqueueOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#operationQueue.then(operation);
    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
