// SPDX-License-Identifier: GPL-3.0-or-later

import {
  chmod,
  lstat,
  mkdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import { RepositoryCatalogError } from "../../repository/repositoryCatalog.ts";
import { hasFileSystemErrorCode } from "../../persistence/fileSystemError.ts";

const registryLockFileName = ".ctn-webdav-registry.lock";
const connectionsDirectoryName = "webdav-connections";

async function createSecureDirectory(directory: string) {
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

export class WebDavRegistryLease {
  #compromised = false;
  #connectionsDirectory: string;
  #releaseLock: (() => Promise<void>) | null = null;
  #stateDirectory: string;

  constructor(stateDirectory: string) {
    this.#stateDirectory = path.resolve(stateDirectory);
    this.#connectionsDirectory = path.join(
      this.#stateDirectory,
      connectionsDirectoryName,
    );
  }

  get connectionsDirectory() {
    return this.#connectionsDirectory;
  }

  async acquire() {
    if (this.#releaseLock) {
      return;
    }
    await createSecureDirectory(this.#stateDirectory);
    this.#stateDirectory = await realpath(this.#stateDirectory);
    this.#connectionsDirectory = path.join(
      this.#stateDirectory,
      connectionsDirectoryName,
    );
    await createSecureDirectory(this.#connectionsDirectory);
    this.#compromised = false;

    try {
      this.#releaseLock = await lock(this.#stateDirectory, {
        lockfilePath: path.join(
          this.#stateDirectory,
          registryLockFileName,
        ),
        onCompromised: () => {
          this.#compromised = true;
        },
        realpath: true,
        retries: 0,
        stale: 30_000,
        update: 10_000,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ELOCKED"
      ) {
        throw new RepositoryCatalogError(
          "repository_busy",
          "WebDAV registry is already owned by another server",
        );
      }
      throw error;
    }
  }

  assertOwned() {
    if (this.#compromised || !this.#releaseLock) {
      throw new RepositoryCatalogError(
        "repository_busy",
        "WebDAV registry writer lock was lost",
      );
    }
  }

  async release() {
    const release = this.#releaseLock;

    this.#releaseLock = null;
    if (release) {
      await release();
    }
  }
}
