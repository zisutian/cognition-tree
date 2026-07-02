// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

export async function writeFileAtomically(filePath, content) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function writeJsonAtomically(filePath, value) {
  await writeFileAtomically(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
  );
}
