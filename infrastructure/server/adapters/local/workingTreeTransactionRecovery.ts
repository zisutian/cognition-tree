// SPDX-License-Identifier: GPL-3.0-or-later

import {
  lstat,
  readdir,
  rm,
} from "node:fs/promises";
import path from "node:path";
import {
  RepositoryCorruptError,
} from "../../repository/repositoryStore.ts";
import { hasFileSystemErrorCode } from "../../persistence/fileSystemError.ts";
import {
  fsyncDirectory,
} from "../../persistence/fileSystemPersistence.ts";
import { readLocalJson } from "./localWorkingTree.ts";
import {
  localControlDirectoryName,
  localTransactionsDirectoryName,
} from "./localWorkingTreeLayout.ts";
import {
  applyLocalWorkingTreeTransaction,
  readLocalWorkingTreeHeadRevision,
} from "./workingTreeTransactionExecutor.ts";
import {
  isLocalTransactionId,
  parseLocalTransactionManifest,
  type LocalTransactionManifest,
} from "./workingTreeTransactionManifest.ts";

async function assertTransactionPayloadLayout(
  transactionDir: string,
  manifest: LocalTransactionManifest,
) {
  const rootEntries = await readdir(
    transactionDir,
    { withFileTypes: true },
  );
  const expectedRootEntries = new Set([
    "backup",
    "manifest.json",
    "staged",
  ]);

  if (
    rootEntries.length !== expectedRootEntries.size ||
    rootEntries.some((entry) => !expectedRootEntries.has(entry.name))
  ) {
    throw new RepositoryCorruptError(
      "Local transaction contains unknown data",
    );
  }

  for (const directoryName of ["backup", "staged"] as const) {
    const directoryPath = path.join(transactionDir, directoryName);
    const directoryStats = await lstat(directoryPath);

    if (
      !directoryStats.isDirectory() ||
      directoryStats.isSymbolicLink()
    ) {
      throw new RepositoryCorruptError(
        "Local transaction payload directory is unsafe",
      );
    }
    const expectedNames = new Set(
      manifest.operations.flatMap((operation) => {
        const payload = directoryName === "backup"
          ? operation.backupFile
          : operation.stagedFile;

        return payload === null
          ? []
          : [path.posix.basename(payload)];
      }),
    );
    const entries = await readdir(
      directoryPath,
      { withFileTypes: true },
    );

    if (
      entries.length !== expectedNames.size ||
      entries.some((entry) => !expectedNames.has(entry.name))
    ) {
      throw new RepositoryCorruptError(
        "Local transaction payload set is invalid",
      );
    }
    for (const entry of entries) {
      const stats = await lstat(path.join(directoryPath, entry.name));

      if (
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !stats.isFile() ||
        stats.isSymbolicLink() ||
        stats.nlink > 1
      ) {
        throw new RepositoryCorruptError(
          "Local transaction payload file is unsafe",
        );
      }
    }
  }

  const manifestStats = await lstat(
    path.join(transactionDir, "manifest.json"),
  );

  if (
    !manifestStats.isFile() ||
    manifestStats.isSymbolicLink() ||
    manifestStats.nlink > 1
  ) {
    throw new RepositoryCorruptError(
      "Local transaction manifest is unsafe",
    );
  }
}

export async function recoverLocalWorkingTreeTransactions(
  rootDir: string,
) {
  const transactionsDir = path.join(
    rootDir,
    localControlDirectoryName,
    localTransactionsDirectoryName,
  );
  const entries = await readdir(
    transactionsDir,
    { withFileTypes: true },
  ).catch((error: unknown) => {
    if (hasFileSystemErrorCode(error, "ENOENT")) return [];
    throw error;
  });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new RepositoryCorruptError(
        "Local transaction directory contains an invalid entry",
      );
    }
    if (!isLocalTransactionId(entry.name)) {
      throw new RepositoryCorruptError(
        "Local transaction directory contains an unknown entry",
      );
    }
    const transactionDir = path.join(transactionsDir, entry.name);
    const transactionStats = await lstat(transactionDir);

    if (
      !transactionStats.isDirectory() ||
      transactionStats.isSymbolicLink()
    ) {
      throw new RepositoryCorruptError(
        "Local transaction directory is unsafe",
      );
    }
    const manifestPath = path.join(transactionDir, "manifest.json");
    const manifestValue = await readLocalJson(manifestPath).catch(
      (error: unknown) => {
        if (hasFileSystemErrorCode(error, "ENOENT")) return null;
        throw error;
      },
    );

    if (manifestValue === null) {
      await rm(transactionDir, { force: true, recursive: true });
      continue;
    }
    const manifest = parseLocalTransactionManifest(manifestValue);

    await assertTransactionPayloadLayout(transactionDir, manifest);
    const headRevision = await readLocalWorkingTreeHeadRevision(rootDir);

    if (headRevision === manifest.baseRevision) {
      await applyLocalWorkingTreeTransaction(
        transactionDir,
        rootDir,
        manifest,
        "backup",
      );
    } else if (headRevision === manifest.targetRevision) {
      await applyLocalWorkingTreeTransaction(
        transactionDir,
        rootDir,
        manifest,
        "staged",
      );
    } else {
      throw new RepositoryCorruptError(
        "Local transaction head matches neither transaction state",
      );
    }
    await rm(transactionDir, { force: true, recursive: true });
    await fsyncDirectory(transactionsDir);
  }
}
