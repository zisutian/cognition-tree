// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import type { LocalManagedFileSet } from "./localWorkingTreeLayout.ts";

export function localManagedContentHash(source: string | null) {
  return source === null
    ? "absent"
    : `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

export type PlannedLocalFileOperation = {
  backupFile: string | null;
  baseHash: string;
  currentContent: string | null;
  path: string;
  stagedFile: string | null;
  targetContent: string | null;
  targetHash: string;
};

export function planLocalWorkingTreeTransaction(
  currentState: {
    directories: ReadonlySet<string>;
    files: LocalManagedFileSet;
  },
  targetFiles: LocalManagedFileSet,
) {
  const allPaths = new Set([...currentState.files.keys(), ...targetFiles.keys()]);
  const operations: PlannedLocalFileOperation[] = [];

  for (const relativePath of [...allPaths].sort()) {
    const currentContent = currentState.files.get(relativePath) ?? null;
    const targetContent = targetFiles.get(relativePath) ?? null;

    if (currentContent === targetContent) continue;
    const stem = String(operations.length).padStart(6, "0");

    operations.push({
      backupFile: currentContent === null ? null : `backup/${stem}`,
      baseHash: localManagedContentHash(currentContent),
      currentContent,
      path: relativePath,
      stagedFile: targetContent === null ? null : `staged/${stem}`,
      targetContent,
      targetHash: localManagedContentHash(targetContent),
    });
  }

  return {
    backupDirectories: [...currentState.directories].sort(),
    operations,
  };
}
