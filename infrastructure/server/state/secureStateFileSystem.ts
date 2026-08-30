// SPDX-License-Identifier: GPL-3.0-or-later

import { chmod, lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { hasFileSystemErrorCode } from "../persistence/fileSystemError.ts";
import {
  fsyncDirectory,
  isSecureDirectory,
  isSecureRegularFile,
  readSecureFileUtf8,
  writeFileDurably,
} from "../persistence/fileSystemPersistence.ts";

async function findExistingAncestor(directory: string) {
  let current = path.dirname(path.resolve(directory));

  while (true) {
    try {
      await lstat(current);
      return current;
    } catch (error) {
      if (!hasFileSystemErrorCode(error, "ENOENT")) throw error;
    }
    const parent = path.dirname(current);

    if (parent === current) {
      throw new Error("State directory does not have an existing ancestor.");
    }
    current = parent;
  }
}

async function fsyncCreatedDirectoryChain(
  directory: string,
  existingAncestor: string,
) {
  let current = path.resolve(directory);
  const boundary = path.resolve(existingAncestor);
  const relative = path.relative(boundary, current);

  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("State directory durability boundary is invalid.");
  }
  while (true) {
    await fsyncDirectory(current);
    if (current === boundary) return;
    current = path.dirname(current);
  }
}

export async function ensureSecureStateDirectory(directory: string) {
  const resolvedDirectory = path.resolve(directory);
  let existingAncestor: string | null = null;
  let stats;

  try {
    stats = await lstat(resolvedDirectory);
  } catch (error) {
    if (!hasFileSystemErrorCode(error, "ENOENT")) throw error;
    existingAncestor = await findExistingAncestor(resolvedDirectory);
    await mkdir(resolvedDirectory, { mode: 0o700, recursive: true });
    stats = await lstat(resolvedDirectory);
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("State directory is not a regular directory.");
  }
  let permissionsChanged = false;

  if ((stats.mode & 0o777) !== 0o700) {
    await chmod(resolvedDirectory, 0o700);
    permissionsChanged = true;
    stats = await lstat(resolvedDirectory);
  }
  if (!isSecureDirectory(stats)) {
    throw new Error("State directory is not secure.");
  }
  if (existingAncestor) {
    await fsyncCreatedDirectoryChain(resolvedDirectory, existingAncestor);
  } else if (permissionsChanged) {
    await fsyncDirectory(resolvedDirectory);
  }
}

export async function assertSecureStateDirectory(directory: string) {
  if (!isSecureDirectory(await lstat(directory))) {
    throw new Error("State directory permissions or type are invalid.");
  }
}

export async function secureStateDirectoryExists(directory: string) {
  try {
    await assertSecureStateDirectory(directory);
    return true;
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ENOENT")) return false;
    throw error;
  }
}

export {
  fsyncDirectory,
  hasFileSystemErrorCode,
  isSecureRegularFile,
  readSecureFileUtf8,
  writeFileDurably,
};
