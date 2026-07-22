// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { open, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import { hasFileSystemErrorCode } from "../../repository/fileSystemError.ts";

const atomicTemporaryFilePattern =
  /\.\d+\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i;

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

export async function writeFileAtomically(filePath: string, content: string) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFileDurably(temporaryPath, content);
    await rename(temporaryPath, filePath);
    await fsyncDirectory(path.dirname(filePath));
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function writeJsonAtomically(filePath: string, value: unknown) {
  await writeFileAtomically(
    filePath,
    `${serializeJsonIteratively(value, { indent: 2 })}\n`,
  );
}

export async function removeAtomicWriteTemporaryFiles(directory: string) {
  let entries: Dirent<string>[];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ENOENT")) {
      return;
    }
    throw error;
  }

  await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await removeAtomicWriteTemporaryFiles(entryPath);
    } else if (entry.isFile() && atomicTemporaryFilePattern.test(entry.name)) {
      await rm(entryPath, { force: true });
    }
  }));
}
