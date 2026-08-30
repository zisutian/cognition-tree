// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  opendir,
  realpath,
  rm,
  stat,
  utimes,
} from "node:fs/promises";
import path from "node:path";
import {
  SystemMigrationValidationError,
} from "../../../application/system/systemConfiguration.ts";

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

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function overlaps(left: string, right: string) {
  const relative = path.relative(left, right);
  const reverse = path.relative(right, left);

  return relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative)) ||
    (!reverse.startsWith("..") && !path.isAbsolute(reverse));
}

function stableFileIdentity(
  stats: Awaited<ReturnType<typeof lstat>>,
): StableFileIdentity {
  return {
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
    left.modified === right.modified && left.size === right.size;
}

async function fingerprintFile(
  current: string,
  relative: string,
  observed: Awaited<ReturnType<typeof lstat>>,
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
    if (!isMissing(error)) throw error;
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
      if (!isMissing(error)) throw error;
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
  try {
    await copyFile(source, destination);
    await chmod(destination, sourceStats.mode & 0o777);
    await utimes(destination, sourceStats.atime, sourceStats.mtime);
  } finally {
    await utimes(source, sourceStats.atime, sourceStats.mtime);
  }
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
  const sourceStats = await stat(source);

  await mkdir(destination, { mode: sourceStats.mode & 0o777, recursive: true });
  for (const relative of authoritativePartitions) {
    const from = path.join(source, relative);

    try {
      await lstat(from);
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    const to = path.join(destination, relative);

    await mkdir(path.dirname(to), { mode: 0o700, recursive: true });
    await copyTree(from, to);
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
      if (isMissing(error)) continue;
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
