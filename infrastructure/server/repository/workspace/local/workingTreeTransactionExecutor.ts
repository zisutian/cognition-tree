// SPDX-License-Identifier: GPL-3.0-or-later

import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  rm,
  rmdir,
} from "node:fs/promises";
import path from "node:path";
import {
  RepositoryCorruptError,
} from "../../store.ts";
import { hasFileSystemErrorCode } from "../../../persistence/fileSystemError.ts";
import {
  fsyncDirectory,
  replaceFileDurably,
} from "../../../persistence/fileSystemPersistence.ts";
import { readLocalJson } from "./localWorkingTree.ts";
import { parseLocalRepositoryMetadata } from "./localWorkingTreeCodec.ts";
import {
  localControlDirectoryName,
  localRepositoryMetadataFileName,
  type LocalManagedFileSet,
} from "./localWorkingTreeLayout.ts";
import {
  localManagedContentHash,
} from "./workingTreeTransactionPlanner.ts";
import type {
  LocalTransactionFileOperation,
  LocalTransactionManifest,
} from "./workingTreeTransactionManifest.ts";
import {
  captureLocalManagedWorkingTreeState,
  equalLocalManagedDirectories,
  equalLocalManagedFiles,
  localWorkingTreePathType,
  readLocalManagedFile,
} from "./workingTreeTransactionState.ts";

type FileSystemIdentity = {
  device: string;
  inode: string;
};

function fileSystemIdentity(
  stats: Awaited<ReturnType<typeof lstat>>,
): FileSystemIdentity {
  return { device: String(stats.dev), inode: String(stats.ino) };
}

function equalFileSystemIdentities(
  left: readonly FileSystemIdentity[],
  right: readonly FileSystemIdentity[],
) {
  return left.length === right.length &&
    left.every((identity, index) =>
      identity.device === right[index]?.device &&
      identity.inode === right[index]?.inode
    );
}

async function captureTransactionParentIdentities(
  transactionDir: string,
  sourceRelativePath: string,
) {
  const identities: FileSystemIdentity[] = [];
  let current = transactionDir;
  const segments = path.posix.dirname(sourceRelativePath).split("/");

  for (const segment of ["", ...segments]) {
    if (segment) current = path.join(current, segment);
    const stats = await lstat(current);

    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new RepositoryCorruptError(
        "Local transaction payload parent is unsafe",
      );
    }
    identities.push(fileSystemIdentity(stats));
  }
  return identities;
}

async function readTransactionFile(
  transactionDir: string,
  sourceRelativePath: string,
) {
  const filePath = path.join(
    transactionDir,
    ...sourceRelativePath.split("/"),
  );
  const parentsBefore = await captureTransactionParentIdentities(
    transactionDir,
    sourceRelativePath,
  );
  let handle;

  try {
    handle = await open(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const stats = await handle.stat();

    if (!stats.isFile() || stats.nlink > 1) {
      throw new RepositoryCorruptError(
        "Local transaction payload is unsafe",
      );
    }
    const source = await handle.readFile("utf8");
    const after = await handle.stat();

    if (
      !after.isFile() ||
      after.nlink > 1 ||
      stats.dev !== after.dev ||
      stats.ino !== after.ino ||
      stats.size !== after.size ||
      stats.mtimeMs !== after.mtimeMs
    ) {
      throw new RepositoryCorruptError(
        "Local transaction payload changed while being read",
      );
    }
    const parentsAfter = await captureTransactionParentIdentities(
      transactionDir,
      sourceRelativePath,
    );

    if (!equalFileSystemIdentities(parentsBefore, parentsAfter)) {
      throw new RepositoryCorruptError(
        "Local transaction payload parent changed while being read",
      );
    }
    return source;
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ELOOP")) {
      throw new RepositoryCorruptError(
        "Local transaction payload is a symbolic link",
      );
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function ensureLocalWorkingTreeDirectory(
  rootDir: string,
  relativePath: string,
) {
  const segments = relativePath.split("/");
  let current = rootDir;

  for (const segment of segments) {
    current = path.join(current, segment);
    const type = await localWorkingTreePathType(current);

    if (type === null) {
      await mkdir(current, { mode: 0o700 });
      await fsyncDirectory(path.dirname(current));
    } else if (type !== "directory") {
      throw new RepositoryCorruptError(
        "Local target directory is occupied by another entry",
      );
    }
  }
}

async function applyFile(
  transactionDir: string,
  rootDir: string,
  operation: LocalTransactionFileOperation,
  direction: "backup" | "staged",
) {
  const sourceRelativePath = direction === "backup"
    ? operation.backupFile
    : operation.stagedFile;
  const targetPath = path.join(rootDir, ...operation.path.split("/"));
  const currentSource = await readLocalManagedFile(
    rootDir,
    operation.path,
  );
  const currentHash = localManagedContentHash(currentSource);

  if (
    currentHash !== operation.baseHash &&
    currentHash !== operation.targetHash
  ) {
    throw new RepositoryCorruptError(
      "Local transaction found an externally modified managed file",
    );
  }
  if (sourceRelativePath === null) {
    const type = await localWorkingTreePathType(targetPath);

    if (type === "file") {
      await rm(targetPath);
      await fsyncDirectory(path.dirname(targetPath));
    } else if (type !== null) {
      throw new RepositoryCorruptError(
        "Local transaction target changed type",
      );
    }
    return;
  }

  await ensureLocalWorkingTreeDirectory(
    rootDir,
    path.posix.dirname(operation.path),
  );
  const source = await readTransactionFile(
    transactionDir,
    sourceRelativePath,
  );
  const expectedSourceHash = direction === "backup"
    ? operation.baseHash
    : operation.targetHash;

  if (localManagedContentHash(source) !== expectedSourceHash) {
    throw new RepositoryCorruptError(
      "Local transaction payload hash is invalid",
    );
  }
  const type = await localWorkingTreePathType(targetPath);

  if (type !== null && type !== "file") {
    throw new RepositoryCorruptError(
      "Local transaction target is occupied",
    );
  }
  await replaceFileDurably(targetPath, source);
}

export async function removeObsoleteLocalWorkingTreeDirectories(
  rootDir: string,
  candidateDirectories: readonly string[],
  desiredDirectories: ReadonlySet<string>,
) {
  const candidates = candidateDirectories
    .filter((directory) => !desiredDirectories.has(directory))
    .sort((left, right) =>
      right.split("/").length - left.split("/").length
    );

  for (const directory of candidates) {
    await rmdir(
      path.join(rootDir, ...directory.split("/")),
    ).catch((error: unknown) => {
      if (
        !hasFileSystemErrorCode(error, "ENOTEMPTY") &&
        !hasFileSystemErrorCode(error, "ENOENT")
      ) {
        throw error;
      }
    });
  }
}

export async function applyLocalWorkingTreeTransaction(
  transactionDir: string,
  rootDir: string,
  manifest: LocalTransactionManifest,
  direction: "backup" | "staged",
) {
  const desiredDirectories = direction === "staged"
    ? manifest.targetDirectories
    : manifest.backupDirectories;

  for (const directory of desiredDirectories) {
    await ensureLocalWorkingTreeDirectory(rootDir, directory);
  }
  const targetDirectories = new Set(desiredDirectories);
  const headPath =
    `${localControlDirectoryName}/${localRepositoryMetadataFileName}`;

  for (const operation of manifest.operations) {
    if (operation.path !== headPath) {
      await applyFile(transactionDir, rootDir, operation, direction);
    }
  }
  const headOperation = manifest.operations.find(
    (operation) => operation.path === headPath,
  );

  if (headOperation) {
    await applyFile(
      transactionDir,
      rootDir,
      headOperation,
      direction,
    );
  }
  await removeObsoleteLocalWorkingTreeDirectories(
    rootDir,
    direction === "staged"
      ? manifest.backupDirectories
      : manifest.targetDirectories,
    targetDirectories,
  );
}

export async function applyLocalWorkingTreeTransactionBody(
  transactionDir: string,
  rootDir: string,
  manifest: LocalTransactionManifest,
) {
  const headPath =
    `${localControlDirectoryName}/${localRepositoryMetadataFileName}`;

  for (const operation of manifest.operations) {
    if (operation.path !== headPath) {
      await applyFile(transactionDir, rootDir, operation, "staged");
    }
  }
}

export async function applyLocalWorkingTreeTransactionHead(
  transactionDir: string,
  rootDir: string,
  manifest: LocalTransactionManifest,
) {
  const headPath =
    `${localControlDirectoryName}/${localRepositoryMetadataFileName}`;
  const headOperation = manifest.operations.find(
    (operation) => operation.path === headPath,
  );

  if (!headOperation) {
    if (manifest.baseRevision === manifest.targetRevision) return;
    throw new RepositoryCorruptError(
      "Local transaction did not stage repository head",
    );
  }
  await applyFile(transactionDir, rootDir, headOperation, "staged");
}

export async function readLocalWorkingTreeHeadRevision(rootDir: string) {
  return parseLocalRepositoryMetadata(
    await readLocalJson(
      path.join(
        rootDir,
        localControlDirectoryName,
        localRepositoryMetadataFileName,
      ),
    ),
  ).currentRevision;
}

export async function assertLocalWorkingTreeBodyMatchesTarget(
  rootDir: string,
  targetFiles: LocalManagedFileSet,
  targetDirectories: readonly string[],
) {
  const current = await captureLocalManagedWorkingTreeState(rootDir);
  const headPath =
    `${localControlDirectoryName}/${localRepositoryMetadataFileName}`;
  const expected = new Map(targetFiles);

  expected.set(headPath, current.files.get(headPath) ?? "");
  if (
    !equalLocalManagedFiles(current.files, expected) ||
    !equalLocalManagedDirectories(
      current.directories,
      new Set(targetDirectories),
    )
  ) {
    throw new RepositoryCorruptError(
      "Local working tree does not match the staged target before head publication",
    );
  }
}
