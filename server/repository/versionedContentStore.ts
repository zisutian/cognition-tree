// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import type {
  VersionedContentCommitDto,
  VersionedContentCommitResultDto,
  VersionedContentSnapshotDto,
} from "../../contracts/common/versionedContent.ts";
import { hasFileSystemErrorCode } from "./fileSystemError.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
} from "./repositoryStore.ts";

export type VersionedContentStore<Content> = {
  commitSnapshot(value: unknown): Promise<VersionedContentCommitResultDto>;
  loadSnapshot(): Promise<VersionedContentSnapshotDto<Content>>;
};

export type VersionedContentStoreDefinition<Content> = {
  createRevision(content: Content): `sha256:${string}`;
  normalizeReadError(error: unknown): unknown;
  parseCommit(value: unknown): VersionedContentCommitDto<Content>;
  parseContent(value: unknown): Content;
  serializeContent(content: Content): string;
  validateContent(content: Content): void;
  validateTransition(previous: Content, next: Content): void;
  validateWriteBoundary(operation: () => void): void;
};

export class VersionedContentRevisionConflictError extends Error {
  currentRevision: `sha256:${string}`;

  constructor(currentRevision: `sha256:${string}`) {
    super("Versioned content changed outside the current session");
    this.name = "VersionedContentRevisionConflictError";
    this.currentRevision = currentRevision;
  }
}

async function fsyncDirectory(directory: string) {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class FileSystemVersionedContentStore<Content>
  implements VersionedContentStore<Content> {
  readonly #definition: VersionedContentStoreDefinition<Content>;
  readonly #filePath: string;
  #operationQueue: Promise<void> = Promise.resolve();

  constructor(
    filePath: string,
    definition: VersionedContentStoreDefinition<Content>,
  ) {
    this.#filePath = path.resolve(filePath);
    this.#definition = definition;
  }

  loadSnapshot() {
    return this.#enqueueOperation(() => this.#readSnapshot());
  }

  commitSnapshot(value: unknown) {
    const commit = this.#definition.parseCommit(value);

    this.#definition.validateWriteBoundary(() =>
      this.#definition.validateContent(commit.content)
    );
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
            "Versioned content store is busy",
          );
        }
        throw error;
      }
      try {
        const current = await this.#readSnapshot();
        if (current.revision !== commit.baseRevision) {
          throw new VersionedContentRevisionConflictError(current.revision);
        }
        this.#definition.validateWriteBoundary(() =>
          this.#definition.validateTransition(current.content, commit.content)
        );
        const revision = this.#definition.createRevision(commit.content);
        if (revision === current.revision) return { revision };
        await this.#writeContent(commit.content);
        return { revision };
      } finally {
        await release();
      }
    });
  }

  async #readSnapshot(): Promise<VersionedContentSnapshotDto<Content>> {
    let handle;
    try {
      handle = await open(
        this.#filePath,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      );
      const stats = await handle.stat();
      if (!stats.isFile() || (stats.mode & 0o777) !== 0o600) {
        throw new RepositoryCorruptError(
          "Versioned content file permissions or type are invalid",
        );
      }
      const source = await handle.readFile("utf8");
      let value: unknown;
      try {
        value = JSON.parse(source) as unknown;
      } catch {
        throw new RepositoryCorruptError("Versioned content JSON is invalid");
      }
      let content: Content;
      try {
        content = this.#definition.parseContent(value);
        this.#definition.validateContent(content);
      } catch (error) {
        throw this.#definition.normalizeReadError(error);
      }
      return {
        content,
        revision: this.#definition.createRevision(content),
      };
    } catch (error) {
      if (hasFileSystemErrorCode(error, "ENOENT")) {
        throw new RepositoryCorruptError("Versioned content file is missing");
      }
      if (hasFileSystemErrorCode(error, "ELOOP")) {
        throw new RepositoryCorruptError(
          "Versioned content file is a symbolic link",
        );
      }
      throw error;
    } finally {
      await handle?.close();
    }
  }

  async #writeContent(content: Content) {
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
      await handle.writeFile(this.#definition.serializeContent(content), "utf8");
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
