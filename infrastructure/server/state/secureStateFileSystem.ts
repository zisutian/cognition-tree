// SPDX-License-Identifier: GPL-3.0-or-later

import { chmod, lstat, mkdir } from "node:fs/promises";
import {
  fsyncDirectory,
  isSecureDirectory,
  isSecureRegularFile,
  writeFileDurably,
} from "../persistence/fileSystemPersistence.ts";

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function ensureSecureStateDirectory(directory: string) {
  let stats;

  try {
    stats = await lstat(directory);
  } catch (error) {
    if (!isMissing(error)) throw error;
    await mkdir(directory, { mode: 0o700, recursive: true });
    stats = await lstat(directory);
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("State directory is not a regular directory.");
  }
  if ((stats.mode & 0o777) !== 0o700) {
    await chmod(directory, 0o700);
    stats = await lstat(directory);
  }
  if (!isSecureDirectory(stats)) {
    throw new Error("State directory is not secure.");
  }
}

export async function assertSecureStateDirectory(directory: string) {
  if (!isSecureDirectory(await lstat(directory))) {
    throw new Error("State directory permissions or type are invalid.");
  }
}

export {
  fsyncDirectory,
  isSecureRegularFile,
  writeFileDurably,
};
