// SPDX-License-Identifier: GPL-3.0-or-later

import { constants } from "node:fs";
import {
  lstat,
  open,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
} from "../../store.ts";
import { hasFileSystemErrorCode } from "../../../persistence/fileSystemError.ts";
import { readFileHandleUtf8 } from "../../../persistence/fileSystemPersistence.ts";
import {
  localControlDirectoryName,
  localIndexFileName,
  maximumLocalManagedFileBytes,
  localNoteMetadataDirectoryName,
  localRepositoryMetadataFileName,
  localSyntaxDirectoryName,
  type LocalManagedFileSet,
} from "./localWorkingTreeLayout.ts";
import { mapLocalFileSystemEntries } from "./localFileSystemConcurrency.ts";

export type LocalManagedWorkingTreeState = {
  directories: Set<string>;
  files: LocalManagedFileSet;
};

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

export async function localWorkingTreePathType(filePath: string) {
  const stats = await lstat(filePath).catch((error: unknown) => {
    if (hasFileSystemErrorCode(error, "ENOENT")) return null;
    throw error;
  });

  if (!stats) return null;
  if (stats.isSymbolicLink()) return "symlink" as const;
  if (stats.isDirectory()) return "directory" as const;
  if (stats.isFile()) return "file" as const;
  return "other" as const;
}

async function assertSafeParentChain(
  rootDir: string,
  relativePath: string,
) {
  const parentSegments = path.posix.dirname(relativePath) === "."
    ? []
    : path.posix.dirname(relativePath).split("/");
  let current = rootDir;
  const identities: FileSystemIdentity[] = [];

  for (const segment of parentSegments) {
    current = path.join(current, segment);
    const type = await localWorkingTreePathType(current);

    if (type === null) return identities;
    if (type !== "directory") {
      throw new RepositoryCorruptError(
        "Local managed path has an unsafe parent",
      );
    }
    identities.push(fileSystemIdentity(await lstat(current)));
  }
  return identities;
}

export async function readLocalManagedFile(
  rootDir: string,
  relativePath: string,
) {
  const parentsBefore = await assertSafeParentChain(rootDir, relativePath);
  const absolutePath = path.join(rootDir, ...relativePath.split("/"));
  let handle;

  try {
    handle = await open(
      absolutePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const before = await handle.stat();

    if (!before.isFile() || before.nlink > 1) {
      throw new RepositoryCorruptError(
        "Local managed file must be a private regular file",
      );
    }
    const source = await readFileHandleUtf8(
      handle,
      maximumLocalManagedFileBytes,
      "Local managed file",
    );
    const after = await handle.stat();

    if (
      !after.isFile() ||
      after.nlink > 1 ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs
    ) {
      throw new RepositoryAdapterError(
        "repository_busy",
        "Local managed file changed while it was being read",
      );
    }
    const parentsAfter = await assertSafeParentChain(rootDir, relativePath);

    if (!equalFileSystemIdentities(parentsBefore, parentsAfter)) {
      throw new RepositoryAdapterError(
        "repository_busy",
        "Local managed path changed while it was being read",
      );
    }
    return source;
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ENOENT")) return null;
    if (hasFileSystemErrorCode(error, "ELOOP")) {
      throw new RepositoryCorruptError(
        "Local managed file must not be a symbolic link",
      );
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

async function collectManagedFiles(rootDir: string) {
  const files = new Set<string>();
  const directories = new Set<string>();
  const pending = [""];

  while (pending.length > 0) {
    const relativeDirectory = pending.pop();

    if (relativeDirectory === undefined) break;
    const directoryPath = relativeDirectory
      ? path.join(rootDir, ...relativeDirectory.split("/"))
      : rootDir;
    const before = await lstat(directoryPath);

    if (!before.isDirectory() || before.isSymbolicLink()) {
      throw new RepositoryCorruptError(
        "Local managed directory is unsafe",
      );
    }
    const entries = await readdir(directoryPath, { withFileTypes: true });

    const scannedEntries = await mapLocalFileSystemEntries(
      entries,
      async (entry) => {
        if (
          !relativeDirectory &&
          entry.name === localControlDirectoryName
        ) {
          return null;
        }
        const relativePath = relativeDirectory
          ? `${relativeDirectory}/${entry.name}`
          : entry.name;
        const absolutePath = path.join(rootDir, ...relativePath.split("/"));
        const stats = await lstat(absolutePath);

        if (stats.isSymbolicLink()) return null;
        if (stats.isDirectory()) {
          return { kind: "directory" as const, relativePath };
        }
        return stats.isFile() && entry.name.endsWith(".ctn")
          ? { kind: "file" as const, relativePath }
          : null;
      },
    );

    for (const scanned of scannedEntries) {
      if (!scanned) continue;
      if (scanned.kind === "directory") {
        directories.add(scanned.relativePath);
        pending.push(scanned.relativePath);
      } else {
        files.add(scanned.relativePath);
      }
    }
    const after = await lstat(directoryPath);

    if (
      !after.isDirectory() ||
      after.isSymbolicLink() ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.mtimeMs !== after.mtimeMs
    ) {
      throw new RepositoryAdapterError(
        "repository_busy",
        "Local managed directory changed while it was being scanned",
      );
    }
  }

  for (const relativePath of [
    `${localControlDirectoryName}/${localIndexFileName}`,
    `${localControlDirectoryName}/${localRepositoryMetadataFileName}`,
  ]) {
    if (
      await localWorkingTreePathType(
        path.join(rootDir, ...relativePath.split("/")),
      ) === "file"
    ) {
      files.add(relativePath);
    }
  }

  const metadataDirectory = path.join(
    rootDir,
    localControlDirectoryName,
    localNoteMetadataDirectoryName,
  );
  const metadataEntries = await readdir(
    metadataDirectory,
    { withFileTypes: true },
  ).catch((error: unknown) => {
    if (hasFileSystemErrorCode(error, "ENOENT")) return [];
    throw error;
  });

  for (const entry of metadataEntries) {
    if (
      entry.isFile() &&
      !entry.isSymbolicLink() &&
      entry.name.endsWith(".json")
    ) {
      files.add(
        `${localControlDirectoryName}/${localNoteMetadataDirectoryName}/${entry.name}`,
      );
    }
  }

  const syntaxDirectory = path.join(
    rootDir,
    localControlDirectoryName,
    localSyntaxDirectoryName,
  );
  const syntaxEntries = await readdir(
    syntaxDirectory,
    { withFileTypes: true },
  ).catch((error: unknown) => {
    if (hasFileSystemErrorCode(error, "ENOENT")) return [];
    throw error;
  });

  for (const entry of syntaxEntries) {
    if (entry.isFile() && !entry.isSymbolicLink()) {
      files.add(
        `${localControlDirectoryName}/${localSyntaxDirectoryName}/${entry.name}`,
      );
    }
  }
  return { directories, files };
}

async function containsUnmanagedEntry(
  rootDir: string,
  relativeDirectory: string,
) {
  const pending = [relativeDirectory];

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) break;
    const entries = await readdir(
      path.join(rootDir, ...current.split("/")),
      { withFileTypes: true },
    );

    for (const entry of entries) {
      const child = `${current}/${entry.name}`;
      const stats = await lstat(
        path.join(rootDir, ...child.split("/")),
      );

      if (stats.isSymbolicLink()) return true;
      if (stats.isDirectory()) {
        pending.push(child);
      } else if (!stats.isFile() || !entry.name.endsWith(".ctn")) {
        return true;
      }
    }
  }
  return false;
}

export async function assertRemovedDirectoriesAreManaged(
  rootDir: string,
  backupDirectories: readonly string[],
  targetDirectories: readonly string[],
) {
  const target = new Set(targetDirectories);
  const removedRoots = backupDirectories.filter((directory) =>
    !target.has(directory) &&
    !backupDirectories.some((candidate) =>
      candidate !== directory &&
      !target.has(candidate) &&
      directory.startsWith(`${candidate}/`)
    )
  );

  for (const directory of removedRoots) {
    if (await containsUnmanagedEntry(rootDir, directory)) {
      throw new RepositoryAdapterError(
        "invalid_request",
        "A Local folder containing unmanaged data or symbolic links cannot be deleted",
      );
    }
  }
}

export async function captureLocalManagedWorkingTreeState(
  rootDir: string,
): Promise<LocalManagedWorkingTreeState> {
  const { directories, files } = await collectManagedFiles(rootDir);
  const result: LocalManagedFileSet = new Map();
  const relativePaths = [...files];
  const sources = await mapLocalFileSystemEntries(
    relativePaths,
    (relativePath) => readLocalManagedFile(rootDir, relativePath),
  );

  for (let index = 0; index < relativePaths.length; index += 1) {
    const relativePath = relativePaths[index]!;
    const source = sources[index];

    if (source === null || source === undefined) {
      throw new RepositoryCorruptError(
        "Local managed file disappeared while being captured",
      );
    }
    result.set(relativePath, source);
  }
  return { directories, files: result };
}

export function equalLocalManagedFiles(
  left: LocalManagedFileSet,
  right: LocalManagedFileSet,
) {
  return left.size === right.size &&
    [...left].every(
      ([relativePath, source]) => right.get(relativePath) === source,
    );
}

export function equalLocalManagedDirectories(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
) {
  return left.size === right.size &&
    [...left].every((value) => right.has(value));
}

export function equalLocalManagedWorkingTreeState(
  left: LocalManagedWorkingTreeState,
  right: LocalManagedWorkingTreeState,
) {
  return equalLocalManagedFiles(left.files, right.files) &&
    equalLocalManagedDirectories(left.directories, right.directories);
}

export async function localWorkingTreeMatchesTarget(
  rootDir: string,
  targetFiles: LocalManagedFileSet,
  targetDirectories: readonly string[],
) {
  const current = await captureLocalManagedWorkingTreeState(rootDir);

  if (
    current.files.size !== targetFiles.size ||
    !equalLocalManagedDirectories(
      current.directories,
      new Set(targetDirectories),
    )
  ) {
    return false;
  }
  for (const [relativePath, target] of targetFiles) {
    if (current.files.get(relativePath) !== target) return false;
  }
  return true;
}

function parentDirectories(relativePath: string) {
  const result: string[] = [];
  let current = path.posix.dirname(relativePath);

  while (current !== ".") {
    result.push(current);
    current = path.posix.dirname(current);
  }
  return result.reverse();
}

export function targetDirectoriesFromFilesAndIndex(
  targetFiles: LocalManagedFileSet,
  folderPaths: readonly string[],
) {
  const directories = new Set<string>(folderPaths);

  for (const relativePath of targetFiles.keys()) {
    if (relativePath.startsWith(`${localControlDirectoryName}/`)) continue;
    parentDirectories(relativePath).forEach((directory) =>
      directories.add(directory)
    );
  }
  return [...directories].sort((left, right) =>
    left.localeCompare(right)
  );
}
