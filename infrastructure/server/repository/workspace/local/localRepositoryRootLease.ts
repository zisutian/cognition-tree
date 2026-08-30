// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdir, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import { RepositoryCatalogError } from "../../catalog.ts";
import { fsyncDirectory } from "../../../persistence/fileSystemPersistence.ts";

const writerLockFileName = ".ctn-writer.lock";
const catalogCreateStagingPattern =
  /^\.create-.+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const repositoryDeletionTombstonePattern =
  /^\.delete-.+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LocalRepositoryRootLease {
  #initializePromise: Promise<void> | null = null;
  #lockCompromised = false;
  #releaseWriterLock: (() => Promise<void>) | null = null;
  #rootPath: string;

  constructor(rootPath: string) {
    this.#rootPath = path.resolve(rootPath);
  }

  get rootPath() {
    return this.#rootPath;
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
    const release = this.#releaseWriterLock;

    this.#releaseWriterLock = null;
    this.#initializePromise = null;
    if (release) await release();
  }

  assertOwned() {
    if (this.#lockCompromised || !this.#releaseWriterLock) {
      throw new RepositoryCatalogError(
        "repository_busy",
        "Local repository writer lock was lost",
      );
    }
  }

  async #initialize() {
    await mkdir(this.#rootPath, { recursive: true });
    this.#rootPath = await realpath(this.#rootPath);

    try {
      this.#releaseWriterLock = await lock(this.#rootPath, {
        lockfilePath: path.join(this.#rootPath, writerLockFileName),
        onCompromised: () => {
          this.#lockCompromised = true;
        },
        realpath: true,
        retries: 0,
        stale: 30_000,
        update: 10_000,
      });
      const entries = await readdir(this.#rootPath, { withFileTypes: true });
      const staleCreateDirectories = entries.filter(
        (entry) =>
          entry.isDirectory() && catalogCreateStagingPattern.test(entry.name),
      );
      const deletionTombstones = entries.filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.isSymbolicLink() &&
          repositoryDeletionTombstonePattern.test(entry.name),
      );

      if (staleCreateDirectories.length > 0 || deletionTombstones.length > 0) {
        await Promise.all(
          [...staleCreateDirectories, ...deletionTombstones].map((entry) =>
            rm(path.join(this.#rootPath, entry.name), {
              force: true,
              recursive: true,
            })
          ),
        );
        await fsyncDirectory(this.#rootPath);
      }
    } catch (error) {
      const release = this.#releaseWriterLock;

      this.#releaseWriterLock = null;
      if (release) await release().catch(() => undefined);
      if (error instanceof Error && "code" in error && error.code === "ELOCKED") {
        throw new RepositoryCatalogError(
          "repository_busy",
          "Local repository root is already owned by another server",
        );
      }
      throw error;
    }
  }
}
