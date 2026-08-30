// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import path from "node:path";
import { WorkspaceRepositoryContractError } from "../../../../../contracts/workspace/contractValue.ts";
import { hasFileSystemErrorCode } from "../../../persistence/fileSystemError.ts";
import { readFileHandleUtf8 } from "../../../persistence/fileSystemPersistence.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
} from "../../store.ts";
import {
  localControlDirectoryName,
  maximumLocalManagedFileBytes,
  type LocalRepositoryIndex,
} from "./localWorkingTreeLayout.ts";
import { assertLocalProjectedPath } from "./localWorkingTreePath.ts";

export type LocalPhysicalEntry = {
  device: string;
  inode: string;
  kind: "folder" | "note";
  path: string;
  source?: string;
  sourceHash?: string;
  subtreeHash?: string;
};

type StableFileStat = {
  device: string;
  inode: string;
  modified: number;
  size: number;
};

class LocalWorkingTreeUnstableError extends Error {}

function sourceHash(source: string) {
  return createHash("sha256").update(source).digest("hex");
}

function toStableFileStat(
  value: Awaited<ReturnType<typeof lstat>>,
): StableFileStat {
  return {
    device: String(value.dev),
    inode: String(value.ino),
    modified: Number(value.mtimeMs),
    size: Number(value.size),
  };
}

function equalStableFileStat(left: StableFileStat, right: StableFileStat) {
  return left.device === right.device && left.inode === right.inode &&
    left.modified === right.modified && left.size === right.size;
}

export async function readStableLocalFile(filePath: string) {
  let handle;

  try {
    handle = await open(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const before = await handle.stat();

    if (!before.isFile() || before.nlink > 1) {
      throw new RepositoryCorruptError(
        "Managed Local note is not a private regular file",
      );
    }
    const source = await readFileHandleUtf8(
      handle,
      maximumLocalManagedFileBytes,
      "Managed Local note",
    );
    const after = await handle.stat();

    if (
      !after.isFile() ||
      after.nlink > 1 ||
      !equalStableFileStat(toStableFileStat(before), toStableFileStat(after))
    ) {
      throw new LocalWorkingTreeUnstableError();
    }
    return { source, stats: toStableFileStat(after) };
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ELOOP")) {
      throw new RepositoryCorruptError(
        "Managed Local note must not be a symbolic link",
      );
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

async function scanPhysicalWorkingTreeOnce(
  rootDir: string,
): Promise<LocalPhysicalEntry[]> {
  const result: LocalPhysicalEntry[] = [];
  const pending = [""];

  while (pending.length > 0) {
    const relativeDirectory = pending.pop();

    if (relativeDirectory === undefined) break;
    const directoryPath = relativeDirectory
      ? path.join(rootDir, relativeDirectory)
      : rootDir;
    const before = await lstat(directoryPath);

    if (!before.isDirectory() || before.isSymbolicLink()) {
      throw new RepositoryCorruptError(
        "Local repository contains an invalid directory",
      );
    }
    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!relativeDirectory && entry.name === localControlDirectoryName) {
        continue;
      }
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;

      assertLocalProjectedPath(
        relativePath,
        "Local working tree path",
        rootDir,
      );
      const entryPath = path.join(rootDir, ...relativePath.split("/"));
      const entryStats = await lstat(entryPath);

      if (entryStats.isSymbolicLink()) continue;
      if (entryStats.isDirectory()) {
        result.push({
          device: String(entryStats.dev),
          inode: String(entryStats.ino),
          kind: "folder",
          path: relativePath,
        });
        pending.push(relativePath);
      } else if (entryStats.isFile() && entry.name.endsWith(".ctn")) {
        const { source, stats } = await readStableLocalFile(entryPath);

        result.push({
          device: stats.device,
          inode: stats.inode,
          kind: "note",
          path: relativePath,
          source,
          sourceHash: sourceHash(source),
        });
      }
    }
    const after = await lstat(directoryPath);

    if (
      !after.isDirectory() ||
      after.isSymbolicLink() ||
      !equalStableFileStat(toStableFileStat(before), toStableFileStat(after))
    ) {
      throw new LocalWorkingTreeUnstableError();
    }
  }
  const folderHashes = createPhysicalSubtreeHashes(result);

  result.forEach((entry) => {
    if (entry.kind === "folder") {
      entry.subtreeHash = folderHashes.get(entry.path);
    }
  });
  return result;
}

function createPhysicalSubtreeHashes(
  entries: readonly LocalPhysicalEntry[],
) {
  const hashes = new Map<string, string>();

  for (const folder of entries.filter((entry) => entry.kind === "folder")) {
    const prefix = `${folder.path}/`;
    const facts = entries
      .filter((entry) => entry.path.startsWith(prefix))
      .map((entry) => entry.kind === "folder"
        ? `folder:${entry.path.slice(prefix.length)}`
        : `note:${entry.path.slice(prefix.length)}:${entry.sourceHash ?? ""}`)
      .sort();

    hashes.set(folder.path, sourceHash(facts.join("\n")));
  }
  return hashes;
}

export async function scanPhysicalWorkingTree(rootDir: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await scanPhysicalWorkingTreeOnce(rootDir);
    } catch (error) {
      if (
        hasFileSystemErrorCode(error, "ENAMETOOLONG") ||
        error instanceof WorkspaceRepositoryContractError
      ) {
        throw new RepositoryAdapterError(
          "invalid_request",
          "Local repository path exceeds the supported filesystem limit",
        );
      }
      if (
        !(error instanceof LocalWorkingTreeUnstableError) ||
        attempt === 1
      ) {
        if (error instanceof LocalWorkingTreeUnstableError) {
          throw new RepositoryAdapterError(
            "repository_busy",
            "Local repository changed while it was being scanned",
          );
        }
        throw error;
      }
    }
  }
  throw new RepositoryAdapterError(
    "repository_busy",
    "Local repository changed while it was being scanned",
  );
}

function findUniquePhysicalMatch(
  candidates: readonly LocalPhysicalEntry[],
  predicate: (entry: LocalPhysicalEntry) => boolean,
) {
  const matches = candidates.filter(predicate);

  return matches.length === 1 ? matches[0] : null;
}

export function matchLocalPhysicalIdentities(
  previous: LocalRepositoryIndex,
  physical: readonly LocalPhysicalEntry[],
) {
  const unmatched = new Set(physical);
  const byPreviousIdentity = new Map<string, LocalPhysicalEntry>();

  for (const previousEntry of previous.entries) {
    const samePath = findUniquePhysicalMatch(
      [...unmatched],
      (entry) =>
        entry.kind === previousEntry.kind && entry.path === previousEntry.path,
    );
    const inode = previousEntry.device && previousEntry.inode
      ? findUniquePhysicalMatch(
          [...unmatched],
          (entry) => entry.kind === previousEntry.kind &&
            entry.device === previousEntry.device &&
            entry.inode === previousEntry.inode,
        )
      : null;
    const hash = previousEntry.kind === "note"
      ? findUniquePhysicalMatch(
          [...unmatched],
          (entry) => entry.kind === "note" &&
            entry.sourceHash === previousEntry.sourceHash,
        )
      : null;
    const subtree = previousEntry.kind === "folder"
      ? findUniquePhysicalMatch(
          [...unmatched],
          (entry) => entry.kind === "folder" &&
            entry.subtreeHash === previousEntry.subtreeHash,
        )
      : null;
    const matched = samePath ?? inode ?? hash ?? subtree;

    if (matched) {
      byPreviousIdentity.set(
        previousEntry.kind === "folder"
          ? `folder:${previousEntry.folderId}`
          : `note:${previousEntry.noteId}`,
        matched,
      );
      unmatched.delete(matched);
    }
  }
  return { byPreviousIdentity, unmatched };
}

export function isLocalWorkingTreeUnstableError(error: unknown) {
  return error instanceof LocalWorkingTreeUnstableError;
}
