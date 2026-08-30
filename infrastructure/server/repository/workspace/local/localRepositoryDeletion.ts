// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { lstat, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { RepositoryCatalogError } from "../../catalog.ts";
import { fsyncDirectory } from "../../../persistence/fileSystemPersistence.ts";
import { hasFileSystemErrorCode } from "../../../persistence/fileSystemError.ts";
import { assertLocalRepositoryContainsOnlyManagedData } from "./localManagedDataGuard.ts";

export const localRepositoryDeletionPhases = {
  cleanupCompleted: "cleanup-completed",
  deletionCommitted: "deletion-committed",
  tombstoneRenamed: "tombstone-renamed",
} as const;

export type LocalRepositoryDeletionPhase =
  typeof localRepositoryDeletionPhases[keyof typeof localRepositoryDeletionPhases];

export async function deleteLocalRepositoryDirectory({
  onPhase,
  repositoryId,
  repositoryPath,
  rootDir,
}: {
  onPhase(phase: LocalRepositoryDeletionPhase): Promise<void> | void;
  repositoryId: string;
  repositoryPath: string;
  rootDir: string;
}) {
  const stats = await lstat(repositoryPath).catch((error: unknown) => {
    if (hasFileSystemErrorCode(error, "ENOENT")) {
      return null;
    }
    throw error;
  });

  if (!stats) return;
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new RepositoryCatalogError(
      "invalid_request",
      "Repository is not a real directory",
    );
  }

  const canonicalPath = await realpath(repositoryPath).catch((error: unknown) => {
    if (hasFileSystemErrorCode(error, "ENOENT")) {
      return null;
    }
    throw error;
  });

  if (!canonicalPath) return;
  if (path.dirname(canonicalPath) !== rootDir) {
    throw new RepositoryCatalogError(
      "invalid_request",
      "Repository escapes the configured root",
    );
  }

  await assertLocalRepositoryContainsOnlyManagedData(canonicalPath);

  const tombstonePath = path.join(
    rootDir,
    `.delete-${repositoryId}-${randomUUID()}`,
  );

  try {
    await rename(repositoryPath, tombstonePath);
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ENOENT")) return;
    throw error;
  }

  try {
    await onPhase(localRepositoryDeletionPhases.tombstoneRenamed);
    await fsyncDirectory(rootDir);
  } catch (error) {
    try {
      await rename(tombstonePath, repositoryPath);
      await fsyncDirectory(rootDir);
    } catch (rollbackError) {
      const combined = new Error(
        "Repository deletion failed and could not be rolled back",
      ) as Error & { failures?: unknown[] };

      combined.failures = [error, rollbackError];
      throw combined;
    }
    throw error;
  }

  await Promise.resolve()
    .then(() => onPhase(localRepositoryDeletionPhases.deletionCommitted))
    .catch(() => undefined);

  // The durable rename above is the deletion commit point. Physical cleanup
  // is recoverable startup work and must not turn a committed deletion into
  // a reported failure.
  const cleaned = await rm(tombstonePath, { force: true, recursive: true })
    .then(() => true, () => false);

  if (cleaned) {
    await fsyncDirectory(rootDir).catch(() => undefined);
    await Promise.resolve()
      .then(() => onPhase(localRepositoryDeletionPhases.cleanupCompleted))
      .catch(() => undefined);
  }
}
