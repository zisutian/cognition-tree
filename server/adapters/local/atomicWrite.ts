// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { hasFileSystemErrorCode } from "./fileSystemError.ts";

const atomicTemporaryFilePattern =
  /\.\d+\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i;

export async function writeFileAtomically(filePath: string, content: string) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function writeJsonAtomically(filePath: string, value: unknown) {
  await writeFileAtomically(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
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

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await removeAtomicWriteTemporaryFiles(entryPath);
        return;
      }

      if (entry.isFile() && atomicTemporaryFilePattern.test(entry.name)) {
        await rm(entryPath, { force: true });
      }
    }),
  );
}
