// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { constants, type Dirent, type Stats } from "node:fs";
import {
  lstat,
  open,
  readdir,
  rename,
  rm,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import { serializeJsonIteratively } from "../../../contracts/common/index.ts";
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

export async function readFileHandleUtf8(
  handle: FileHandle,
  maximumBytes: number,
  label: string,
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error("File limit must be a positive integer");
  }
  const chunks: Buffer[] = [];
  let size = 0;

  while (true) {
    const buffer = Buffer.allocUnsafe(
      Math.min(64 * 1024, maximumBytes - size + 1),
    );
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);

    if (bytesRead === 0) break;
    size += bytesRead;
    if (size > maximumBytes) throw new Error(`${label} exceeds the size limit`);
    chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(Buffer.concat(chunks, size));
  } catch {
    throw new Error(`${label} is invalid UTF-8`);
  }
}

export async function readSecureFileUtf8(
  filePath: string,
  maximumBytes: number,
  label = "secure file",
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error("Secure file limit must be a positive integer");
  }
  const handle = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );

  try {
    const stats = await handle.stat();

    if (!isSecureRegularFile(stats)) {
      throw new Error(`${label} permissions or type are invalid`);
    }
    if (stats.size > maximumBytes) {
      throw new Error(`${label} exceeds the size limit`);
    }
    return await readFileHandleUtf8(handle, maximumBytes, label);
  } finally {
    await handle.close();
  }
}

export async function fsyncDirectory(directory: string) {
  const handle = await open(directory, "r");

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function confirmSecureFileDurably(filePath: string, expectedSource: string, maximumBytes: number) {
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!isSecureRegularFile(before) || await readFileHandleUtf8(handle, maximumBytes, "state file") !== expectedSource) {
      throw new Error("State changed before durability confirmation");
    }
    await handle.sync();
    await fsyncDirectory(path.dirname(filePath));
    const after = await lstat(filePath);
    if (after.dev !== before.dev || after.ino !== before.ino || !isSecureRegularFile(after) ||
        await readSecureFileUtf8(filePath, maximumBytes) !== expectedSource) {
      throw new Error("State changed during durability confirmation");
    }
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
