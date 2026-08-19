// SPDX-License-Identifier: GPL-3.0-or-later

import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import type {
  VersionedContentCommitDto,
} from "../../../../contracts/common/versionedContent.ts";
import type { PreparedVersionedContent } from "../../../../application/persistence/versionedRepository.ts";
import { hasFileSystemErrorCode } from "../../persistence/fileSystemError.ts";
import {
  isSecureRegularFile,
  replaceFileDurably,
} from "../../persistence/fileSystemPersistence.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
} from "../store.ts";

export type PreparedVersionedContentSnapshot<Content, Projection = unknown> =
  PreparedVersionedContent<Content, Projection> & {
    revision: `sha256:${string}`;
  };

export type VersionedContentCommitReceipt<Content, Projection = unknown> = {
  after: PreparedVersionedContentSnapshot<Content, Projection>;
  before: PreparedVersionedContentSnapshot<Content, Projection>;
  revision: `sha256:${string}`;
};

export type VersionedContentStore<Content, Projection = unknown> = {
  commitPreparedSnapshot(
    commit: VersionedContentCommitDto<Content>,
    projection: Projection,
  ): Promise<VersionedContentCommitReceipt<Content, Projection>>;
  commitSnapshot(
    commit: VersionedContentCommitDto<Content>,
  ): Promise<VersionedContentCommitReceipt<Content, Projection>>;
  loadSnapshot(): Promise<PreparedVersionedContentSnapshot<Content, Projection>>;
};

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

export class VersionedContentRevisionConflictError extends Error {
  currentRevision: `sha256:${string}`;

  constructor(currentRevision: `sha256:${string}`) {
    super("Versioned content changed outside the current session");
    this.name = "VersionedContentRevisionConflictError";
    this.currentRevision = currentRevision;
  }
}

export class FileSystemVersionedContentStore<Content, Projection>
  implements VersionedContentStore<Content, Projection> {
  readonly #definition: VersionedContentStoreDefinition<Content, Projection>;
  readonly #filePath: string;
  #lastPreparedSnapshot: PreparedVersionedContentSnapshot<
    Content,
    Projection
  > | null = null;
  #operationQueue: Promise<void> = Promise.resolve();

  constructor(
    filePath: string,
    definition: VersionedContentStoreDefinition<Content, Projection>,
  ) {
    this.#filePath = path.resolve(filePath);
    this.#definition = definition;
  }

  loadSnapshot() {
    return this.#enqueueOperation(() => this.#readSnapshot());
  }

  commitSnapshot(commit: VersionedContentCommitDto<Content>) {
    return this.#commitSnapshot(commit, (current) => ({
      content: commit.content,
      projection: this.#definition.validateWriteBoundary(() =>
        this.#definition.prepareContent(
          commit.content,
          current.projection,
        )
      ),
    }));
  }

  commitPreparedSnapshot(
    commit: VersionedContentCommitDto<Content>,
    projection: Projection,
  ) {
    return this.#commitSnapshot(commit, () => ({
      content: commit.content,
      projection,
    }));
  }

  #commitSnapshot(
    commit: VersionedContentCommitDto<Content>,
    prepare: (
      current: PreparedVersionedContentSnapshot<Content, Projection>,
    ) => PreparedVersionedContent<Content, Projection>,
  ) {
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
        const prepared = prepare(current);

        this.#definition.validateWriteBoundary(() =>
          this.#definition.validateTransition(current, prepared)
        );
        const revision = this.#definition.createRevision(commit.content);
        if (revision === current.revision) {
          return { after: current, before: current, revision };
        }
        await this.#writeContent(commit.content);
        const after = { ...prepared, revision };

        this.#lastPreparedSnapshot = after;
        return { after, before: current, revision };
      } finally {
        await release();
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
    await replaceFileDurably(
      this.#filePath,
      this.#definition.serializeContent(content),
      { hiddenTemporaryFile: true },
    );
  }

  #enqueueOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#operationQueue.then(operation);
    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
