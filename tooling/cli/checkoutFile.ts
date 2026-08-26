// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import path from "node:path";

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function readCliFile(file: string) {
  const target = path.resolve(file);
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);

  try {
    const stats = await handle.stat();

    if (!stats.isFile()) throw new Error(`Not a regular file: ${target}`);
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

export async function writeCliFileAtomically(
  file: string,
  source: string,
  expectedCurrentSource?: string,
) {
  const target = path.resolve(file);
  const directory = path.dirname(target);

  if (expectedCurrentSource !== undefined) {
    const current = await readCliFile(target);

    if (current !== expectedCurrentSource) return false;
  } else {
    try {
      const stats = await lstat(target);

      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new Error(`Output path is not a regular file: ${target}`);
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  const temporary = path.join(directory, `.${path.basename(target)}-${randomUUID()}.tmp`);
  let handle;

  try {
    handle = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW |
        constants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(source, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, target);
    const directoryHandle = await open(directory, constants.O_RDONLY);

    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
    return true;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
