// SPDX-License-Identifier: GPL-3.0-or-later

import { VersionedContentRevisionConflictError, VersionedContentCommitOutcomeUnknownError } from '../../../../application/persistence/index.ts';
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import type {
  PreparedVersionedCommit,
  PreparedVersionedContent,
  PreparedVersionedSnapshot,
  PreparedVersionedStore,
} from "../../../../application/persistence/index.ts";
import {
  hasFileSystemErrorCode,
  fsyncDirectory,
  isSecureRegularFile,
  readFileHandleUtf8,
  replaceFileDurably,
} from "../../persistence/index.ts";

import {
  RepositoryAdapterError,
  RepositoryCorruptError,
} from "../store.ts";

type PreparedVersionedContentSnapshot<Content, Projection = unknown> =
  PreparedVersionedSnapshot<Content, Projection, `sha256:${string}`>;

export type VersionedContentStore<Content, Projection = unknown> =
  PreparedVersionedStore<Content, Projection, `sha256:${string}`>;

export type VersionedContentStoreDefinition<Content, Projection> = {
  createRevision(content: Content): `sha256:${string}`;
  normalizeReadError(error: unknown): unknown;
  parseContent(value: unknown): Content;
  prepareContent(content: Content, previous?: Projection | null): Projection;
  serializeContent(content: Content): string;
  validateTransition(
    previous: PreparedVersionedContent<Content, Projection>,
    next: PreparedVersionedContent<Content, Projection>,
  ): void;
  validateWriteBoundary<Result>(operation: () => Result): Result;
};

class VersionedContentLockReleaseError extends RepositoryAdapterError {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("adapter_unavailable", "Versioned content lock could not be released");
    this.name = "VersionedContentLockReleaseError";
    this.cause = cause;
  }
}

class VersionedContentRecoveryError extends Error {
  readonly causes: readonly unknown[];

  constructor(message: string, causes: readonly unknown[]) {
    super(message);
    this.name = "VersionedContentRecoveryError";
    this.causes = causes;
  }
}

export type VersionedContentStoreOptions = Readonly<{
  acquireLock?: () => Promise<() => Promise<void>>;
  maximumBytes?: number;
  replaceContent?: (content: string) => Promise<void>;
  synchronizeDirectory?: () => Promise<void>;
}>;

export class FileSystemVersionedContentStore<Content, Projection>
  implements VersionedContentStore<Content, Projection> {
  readonly #acquireLock: () => Promise<() => Promise<void>>;
  readonly #definition: VersionedContentStoreDefinition<Content, Projection>;
  readonly #filePath: string;
  readonly #maximumBytes: number;
  #lastPreparedSnapshot: PreparedVersionedContentSnapshot<
    Content,
    Projection
  > | null = null;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #replaceContent: (content: string) => Promise<void>;
  readonly #synchronizeDirectory: () => Promise<void>;
  #terminalError: Error | null = null;

  constructor(
    filePath: string,
    definition: VersionedContentStoreDefinition<Content, Projection>,
    options: VersionedContentStoreOptions = {},
  ) {
    const maximumBytes = options.maximumBytes ?? 64 * 1024 * 1024;

    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
      throw new Error("Versioned content limit must be a positive integer");
    }
    this.#filePath = path.resolve(filePath);
    this.#maximumBytes = maximumBytes;
    this.#definition = definition;
    this.#acquireLock = options.acquireLock ?? (() =>
      lock(this.#filePath, {
        realpath: true,
        retries: { retries: 20, factor: 1, minTimeout: 5, maxTimeout: 20 },
        stale: 30_000,
        update: 10_000,
      }));
    this.#replaceContent = options.replaceContent ?? ((content) =>
      replaceFileDurably(
        this.#filePath,
        content,
        { hiddenTemporaryFile: true },
      ));
    this.#synchronizeDirectory = options.synchronizeDirectory ?? (() =>
      fsyncDirectory(path.dirname(this.#filePath)));
  }

  loadSnapshot() {
    return this.#enqueueOperation(() => this.#readSnapshot());
  }

  commit(
    transaction: PreparedVersionedCommit<
      Content,
      Projection,
      `sha256:${string}`
    >,
  ) {
    return this.#enqueueOperation(async () => {
      let release: (() => Promise<void>) | null = null;
      try {
        release = await this.#acquireLock();
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ELOCKED") {
          throw new RepositoryAdapterError(
            "repository_busy",
            "Versioned content store is busy",
          );
        }
        throw error;
      }
      let operationFailed = false;

      try {
        const current = await this.#readSnapshot();
        if (current.revision !== transaction.baseRevision) {
          throw new VersionedContentRevisionConflictError(current.revision);
        }

        this.#definition.validateWriteBoundary(() =>
          this.#definition.validateTransition(current, transaction)
        );
        const revision = this.#definition.createRevision(transaction.content);
        if (revision === current.revision) {
          return { after: current, before: current, revision };
        }
        try {
          await this.#writeContent(transaction.content);
        } catch (error) {
          return await this.#resolveFailedCommit(
            current,
            transaction,
            revision,
            error,
          );
        }
        const after = {
          content: transaction.content,
          projection: transaction.projection,
          revision,
        };

        this.#lastPreparedSnapshot = after;
        return { after, before: current, revision };
      } catch (error) {
        operationFailed = true;
        throw error;
      } finally {
        try {
          await release();
        } catch (error) {
          const releaseError = new VersionedContentLockReleaseError(error);

          this.#terminalError ??= releaseError;
          if (operationFailed) throw this.#terminalError;
        }
      }
    });
  }

  async #readSnapshot(): Promise<
    PreparedVersionedContentSnapshot<Content, Projection>
  > {
    let handle;
    try {
      handle = await open(
        this.#filePath,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      );
      const stats = await handle.stat();
      if (!isSecureRegularFile(stats)) {
        throw new RepositoryCorruptError(
          "Versioned content file permissions or type are invalid",
        );
      }
      const source = await readFileHandleUtf8(
        handle,
        this.#maximumBytes,
        "Versioned content file",
      );
      let value: unknown;
      try {
        value = JSON.parse(source) as unknown;
      } catch {
        throw new RepositoryCorruptError("Versioned content JSON is invalid");
      }
      let content: Content;
      try {
        content = this.#definition.parseContent(value);
      } catch (error) {
        throw this.#definition.normalizeReadError(error);
      }
      const revision = this.#definition.createRevision(content);

      if (this.#lastPreparedSnapshot?.revision === revision) {
        return this.#lastPreparedSnapshot;
      }
      try {
        const snapshot = {
          content,
          projection: this.#definition.prepareContent(
            content,
            this.#lastPreparedSnapshot?.projection,
          ),
          revision,
        };

        this.#lastPreparedSnapshot = snapshot;
        return snapshot;
      } catch (error) {
        throw this.#definition.normalizeReadError(error);
      }
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
    const source = this.#definition.serializeContent(content);

    if (Buffer.byteLength(source) > this.#maximumBytes) {
      throw new RepositoryAdapterError(
        "invalid_request",
        "Versioned content exceeds the size limit",
      );
    }
    await this.#replaceContent(source);
  }

  async #resolveFailedCommit(
    before: PreparedVersionedContentSnapshot<Content, Projection>,
    transaction: PreparedVersionedCommit<
      Content,
      Projection,
      `sha256:${string}`
    >,
    candidateRevision: `sha256:${string}`,
    writeError: unknown,
  ) {
    let observed: PreparedVersionedContentSnapshot<Content, Projection>;

    try {
      observed = await this.#readSnapshot();
    } catch (observationError) {
      throw this.#markCommitOutcomeUnknown(
        new VersionedContentRecoveryError(
          "Versioned content write and recovery observation failed",
          [writeError, observationError],
        ),
        null,
      );
    }
    if (observed.revision === before.revision) {
      throw writeError;
    }
    if (observed.revision !== candidateRevision) {
      throw this.#markCommitOutcomeUnknown(writeError, observed.revision);
    }
    try {
      await this.#synchronizeDirectory();
    } catch (synchronizationError) {
      throw this.#markCommitOutcomeUnknown(
        new VersionedContentRecoveryError(
          "Versioned content recovery synchronization failed",
          [writeError, synchronizationError],
        ),
        observed.revision,
      );
    }
    const after = {
      content: transaction.content,
      projection: transaction.projection,
      revision: candidateRevision,
    };

    this.#lastPreparedSnapshot = after;
    return { after, before, revision: candidateRevision };
  }

  #markCommitOutcomeUnknown(
    cause: unknown,
    currentRevision: `sha256:${string}` | null,
  ) {
    const failure = new VersionedContentCommitOutcomeUnknownError(
      cause,
      currentRevision,
    );

    this.#terminalError ??= failure;
    return this.#terminalError;
  }

  #enqueueOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#operationQueue.then(() => {
      if (this.#terminalError) throw this.#terminalError;
      return operation();
    });
    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
