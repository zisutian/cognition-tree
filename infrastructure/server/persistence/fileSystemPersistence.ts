// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import type { Dirent, Stats } from "node:fs";
import { open, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import { hasFileSystemErrorCode } from "./fileSystemError.ts";

const durableTemporaryFilePattern =
  /\.\d+\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i;

export function isSecureRegularFile(stats: Stats, mode = 0o600) {
  return stats.isFile() && !stats.isSymbolicLink() &&
    (stats.mode & 0o777) === mode;
}

export function isSecureDirectory(stats: Stats, mode = 0o700) {
  return stats.isDirectory() && !stats.isSymbolicLink() &&
    (stats.mode & 0o777) === mode;
}

export async function fsyncDirectory(directory: string) {
  const handle = await open(directory, "r");

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function writeFileDurably(filePath: string, content: string) {
  const handle = await open(filePath, "wx", 0o600);

  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function replaceFileDurably(
  filePath: string,
  content: string,
  { hiddenTemporaryFile = false }: { hiddenTemporaryFile?: boolean } = {},
) {
  const suffix = `${process.pid}.${randomUUID()}.tmp`;
  const temporaryPath = hiddenTemporaryFile
    ? path.join(path.dirname(filePath), `.${path.basename(filePath)}.${suffix}`)
    : `${filePath}.${suffix}`;

  try {
    await writeFileDurably(temporaryPath, content);
    await rename(temporaryPath, filePath);
    await fsyncDirectory(path.dirname(filePath));
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export function replaceJsonDurably(filePath: string, value: unknown) {
  return replaceFileDurably(
    filePath,
    `${serializeJsonIteratively(value, { indent: 2 })}\n`,
  );
}

export async function removeDurableWriteTemporaryFiles(directory: string) {
  let entries: Dirent<string>[];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ENOENT")) return;
    throw error;
  }

  await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await removeDurableWriteTemporaryFiles(entryPath);
    } else if (
      entry.isFile() && durableTemporaryFilePattern.test(entry.name)
    ) {
      await rm(entryPath, { force: true });
    }
  }));
}
