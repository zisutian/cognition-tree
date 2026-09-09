// SPDX-License-Identifier: GPL-3.0-or-later

import { open } from "node:fs/promises";
import { readBoundedUtf8File } from "./boundedFile.ts";

export type CliInputStream = AsyncIterable<Uint8Array>;

export async function readCliJson(
  file: string,
  stdin: CliInputStream,
  maximumBytes = 4 * 1024 * 1024,
) {
  let source: string;
  if (file === "-") {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of stdin) {
      size += chunk.byteLength;
      if (size > maximumBytes)
        throw new Error("JSON input exceeds the size limit");
      chunks.push(chunk);
    }
    source = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } else {
    const handle = await open(file, "r");
    try {
      source = await readBoundedUtf8File(handle, maximumBytes, "JSON input");
    } finally {
      await handle.close();
    }
  }
  return JSON.parse(source) as unknown;
}
