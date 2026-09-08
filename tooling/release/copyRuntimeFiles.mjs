// SPDX-License-Identifier: GPL-3.0-or-later
import { cp } from "node:fs/promises";

/** Preserve package-relative dependency links when moving a complete runtime. */
export function copyRuntimeFiles(source, destination) {
  return cp(source, destination, {
    recursive: true,
    preserveTimestamps: true,
    verbatimSymlinks: true,
  });
}
