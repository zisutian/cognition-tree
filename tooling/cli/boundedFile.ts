// SPDX-License-Identifier: GPL-3.0-or-later

import type { FileHandle } from "node:fs/promises";

const readChunkBytes = 64 * 1024;

export async function readBoundedUtf8File(
  handle: FileHandle,
  maximumBytes: number,
  label: string,
) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error("CLI file limit must be a positive integer");
  }
  const chunks: Buffer[] = [];
  let size = 0;

  while (true) {
    const buffer = Buffer.allocUnsafe(
      Math.min(readChunkBytes, maximumBytes - size + 1),
    );
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);

    if (bytesRead === 0) break;
    size += bytesRead;
    if (size > maximumBytes) {
      throw new Error(`${label} exceeds the size limit`);
    }
    chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(Buffer.concat(chunks, size));
  } catch {
    throw new Error(`${label} is invalid UTF-8`);
  }
}
