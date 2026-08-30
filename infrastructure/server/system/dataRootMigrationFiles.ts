// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  opendir,
  realpath,
  rm,
  utimes,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import {
  SystemMigrationValidationError,
} from "../../../application/system/systemConfiguration.ts";
import { hasFileSystemErrorCode } from "../persistence/fileSystemError.ts";

const authoritativePartitions = [
  "repositories",
  "server/access-v1",
  "server/agent-auth-v1",
  "server/agent-config-v1",
  "server/operations-v1",
] as const;

type FileFingerprint = Readonly<{
  digest: string;
  path: string;
  size: number;
}>;

type StableFileIdentity = Readonly<{
  changed: number;
  device: string;
  inode: string;
  modified: number;
  size: number;
}>;

export type DataRootMigrationFileOperations = Readonly<{
  cleanup(destination: string): Promise<void>;
  copy(source: string, destination: string): Promise<void>;
  prepareDestination(
    destination: string,
    source: string,
    control: string,
  ): Promise<string>;
  verify(source: string, destination: string): Promise<void>;
}>;

function overlaps(left: string, right: string) {
  const relative = path.relative(left, right);
  const reverse = path.relative(right, left);

  return relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative)) ||
    (!reverse.startsWith("..") && !path.isAbsolute(reverse));
}

function stableFileIdentity(
  stats: Stats,
): StableFileIdentity {
  return {
    changed: Number(stats.ctimeMs),
    device: String(stats.dev),
    inode: String(stats.ino),
    modified: Number(stats.mtimeMs),
    size: Number(stats.size),
  };
}

function sameStableFile(
  left: StableFileIdentity,
  right: StableFileIdentity,
) {
  return left.device === right.device && left.inode === right.inode &&
    left.changed === right.changed && left.modified === right.modified &&
    left.size === right.size;
}

async function writeAll(
  handle: FileHandle,
  buffer: Buffer,
  length: number,
) {
  let written = 0;

  while (written < length) {
    const result = await handle.write(
      buffer,
      written,
      length - written,
      null,
    );

    if (result.bytesWritten === 0) {
      throw new Error("Data-root destination stopped accepting bytes");
    }
    written += result.bytesWritten;
  }
}

async function copyRegularFile(
  source: string,
  destination: string,
  observed: Stats,
) {
  const sourceHandle = await open(
    source,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  let destinationHandle: FileHandle | undefined;

  try {
    const before = await sourceHandle.stat();

    if (
      !before.isFile() ||
      !sameStableFile(
        stableFileIdentity(observed),
        stableFileIdentity(before),
      )
    ) {
      throw new Error("Data-root file changed before copying: " + source);
    }
    destinationHandle = await open(
      destination,
      constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW |
        constants.O_WRONLY,
      observed.mode & 0o777,
    );
    const buffer = Buffer.allocUnsafe(64 * 1024);

    while (true) {
      const { bytesRead } = await sourceHandle.read(
        buffer,
        0,
        buffer.length,
        null,
      );

      if (bytesRead === 0) break;
      await writeAll(destinationHandle, buffer, bytesRead);
    }
    const after = await sourceHandle.stat();

    if (
      !after.isFile() ||
      !sameStableFile(
        stableFileIdentity(before),
        stableFileIdentity(after),
      )
    ) {
      throw new Error("Data-root file changed during copying: " + source);
    }
    await destinationHandle.chmod(observed.mode & 0o777);
    await destinationHandle.utimes(observed.atime, observed.mtime);
    await destinationHandle.sync();
  } finally {
    try {
      await sourceHandle.utimes(observed.atime, observed.mtime);
    } finally {
      await Promise.all([
        sourceHandle.close(),
        destinationHandle?.close(),
      ]);
    }
  }
}

async function fingerprintFile(
  current: string,
  relative: string,
  observed: Stats,
): Promise<FileFingerprint> {
  const handle = await open(
    current,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );

  try {
    const before = await handle.stat();

    if (
      !before.isFile() ||
      !sameStableFile(
        stableFileIdentity(observed),
        stableFileIdentity(before),
      )
    ) {
      throw new Error(`Data-root file changed before verification: ${current}`);
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);

    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);

      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
    const after = await handle.stat();

    if (!after.isFile() || !sameStableFile(
      stableFileIdentity(before),
      stableFileIdentity(after),
    )) {
      throw new Error(`Data-root file changed during verification: ${current}`);
    }
    return {
      digest: hash.digest("hex"),
      path: relative,
      size: after.size,
    };
  } finally {
    try {
      await handle.utimes(observed.atime, observed.mtime);
    } finally {
      await handle.close();
    }
  }
}

async function assertDestinationDirectory(
  directory: string,
  message: string,
) {
  const stats = await lstat(directory);

  if (
    stats.isSymbolicLink() ||
    !stats.isDirectory() ||
    await realpath(directory) !== path.normalize(directory)
  ) {
    throw new Error(message + ": " + directory);
  }
}

async function prepareDestination(
  destination: string,
  source: string,
  control: string,
) {
  if (!path.isAbsolute(destination)) {
    throw new SystemMigrationValidationError(
      "Data-root destination must be an absolute path",
    );
  }
  const target = path.normalize(destination);

  if (overlaps(target, source) || overlaps(target, control)) {
    throw new SystemMigrationValidationError(
      "Data-root destination overlaps the source or bootstrap control area",
    );
  }
  try {
    await lstat(target);
    throw new SystemMigrationValidationError(
      "Data-root destination must not exist",
    );
  } catch (error) {
    if (!hasFileSystemErrorCode(error, "ENOENT")) throw error;
  }
  let existingAncestor = path.dirname(target);
  const missingSegments: string[] = [];

  while (true) {
    try {
      const ancestorStats = await lstat(existingAncestor);

      if (ancestorStats.isSymbolicLink() || !ancestorStats.isDirectory()) {
        throw new SystemMigrationValidationError(
          "Data-root destination must not traverse symbolic links",
        );
      }
      break;
    } catch (error) {
      if (!hasFileSystemErrorCode(error, "ENOENT")) throw error;
      const parent = path.dirname(existingAncestor);

      if (parent === existingAncestor) throw error;
      missingSegments.unshift(path.basename(existingAncestor));
      existingAncestor = parent;
    }
  }
  const resolvedAncestor = await realpath(existingAncestor);
  const resolvedTarget = path.join(
    resolvedAncestor,
    ...missingSegments,
    path.basename(target),
  );

  if (resolvedTarget !== target) {
    throw new SystemMigrationValidationError(
      "Data-root destination must not traverse symbolic links",
    );
  }
  return target;
}

async function copyTree(source: string, destination: string) {
  const sourceStats = await lstat(source);

  if (sourceStats.isSymbolicLink()) {
    throw new Error(`Symbolic link is not allowed: ${source}`);
  }
  if (sourceStats.isDirectory()) {
    await mkdir(destination, { mode: sourceStats.mode & 0o777 });
    try {
      const directory = await opendir(source);

      for await (const entry of directory) {
        await copyTree(
          path.join(source, entry.name),
          path.join(destination, entry.name),
        );
      }
      const after = await lstat(source);

      if (
        !after.isDirectory() ||
        !sameStableFile(
          stableFileIdentity(sourceStats),
          stableFileIdentity(after),
        )
      ) {
        throw new Error(
          "Data-root directory changed during copying: " + source,
        );
      }
      await chmod(destination, sourceStats.mode & 0o777);
      await utimes(destination, sourceStats.atime, sourceStats.mtime);
    } finally {
      await utimes(source, sourceStats.atime, sourceStats.mtime);
    }
    return;
  }
  if (!sourceStats.isFile()) {
    throw new Error(`Unsupported data-root entry: ${source}`);
  }
  await copyRegularFile(source, destination, sourceStats);
}

async function fingerprints(
  root: string,
  relative = "",
): Promise<FileFingerprint[]> {
  const current = path.join(root, relative);
  const stats = await lstat(current);

  if (stats.isSymbolicLink()) {
    throw new Error(`Symbolic link is not allowed: ${current}`);
  }
  if (stats.isFile()) {
    return [await fingerprintFile(current, relative, stats)];
  }
  if (!stats.isDirectory()) {
    throw new Error(`Unsupported data-root entry: ${current}`);
  }
  try {
    const directory = await opendir(current);
    const result: FileFingerprint[] = [];

    for await (const entry of directory) {
      result.push(...await fingerprints(root, path.join(relative, entry.name)));
    }
    return result.sort((left, right) => left.path.localeCompare(right.path));
  } finally {
    await utimes(current, stats.atime, stats.mtime);
  }
}

async function copyAuthoritativePartitions(
  source: string,
  destination: string,
) {
  const sourceStats = await lstat(source);

  if (sourceStats.isSymbolicLink() || !sourceStats.isDirectory()) {
    throw new Error("Data-root source is not a regular directory: " + source);
  }
  try {
    await lstat(destination);
    throw new Error(
      "Data-root destination appeared before copying: " + destination,
    );
  } catch (error) {
    if (!hasFileSystemErrorCode(error, "ENOENT")) throw error;
  }
  const firstCreated = await mkdir(destination, {
    mode: sourceStats.mode & 0o777,
    recursive: true,
  });

  if (firstCreated === undefined) {
    throw new Error(
      "Data-root destination appeared before copying: " + destination,
    );
  }
  await assertDestinationDirectory(
    destination,
    "Data-root destination is not a regular directory",
  );
  for (const relative of authoritativePartitions) {
    const from = path.join(source, relative);

    try {
      await lstat(from);
    } catch (error) {
      if (hasFileSystemErrorCode(error, "ENOENT")) continue;
      throw error;
    }
    const to = path.join(destination, relative);
    const parent = path.dirname(to);

    try {
      await mkdir(parent, { mode: 0o700 });
    } catch (error) {
      if (!hasFileSystemErrorCode(error, "EEXIST")) throw error;
      await assertDestinationDirectory(
        parent,
        "Data-root destination parent is invalid",
      );
    }
    await copyTree(from, to);
  }
  const after = await lstat(source);

  if (
    !after.isDirectory() ||
    !sameStableFile(
      stableFileIdentity(sourceStats),
      stableFileIdentity(after),
    )
  ) {
    throw new Error("Data-root source changed during copying: " + source);
  }
  await chmod(destination, sourceStats.mode & 0o777);
  await utimes(destination, sourceStats.atime, sourceStats.mtime);
}

async function verifyAuthoritativePartitions(
  source: string,
  destination: string,
) {
  for (const relative of authoritativePartitions) {
    const from = path.join(source, relative);

    try {
      await lstat(from);
    } catch (error) {
      if (hasFileSystemErrorCode(error, "ENOENT")) continue;
      throw error;
    }
    const [before, after] = await Promise.all([
      fingerprints(from),
      fingerprints(path.join(destination, relative)),
    ]);

    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error(`Data-root verification failed for ${relative}`);
    }
  }
}

export const dataRootMigrationFileOperations: DataRootMigrationFileOperations = {
  cleanup: async (destination) => {
    await rm(destination, { force: true, recursive: true });
  },
  copy: copyAuthoritativePartitions,
  prepareDestination,
  verify: verifyAuthoritativePartitions,
};
