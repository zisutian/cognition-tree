// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import type {
  RepositoryRevisionDto,
  WorkspaceRepositoryContentDto,
} from "../../../contracts/workspace-repository/types.ts";
import {
  createWorkspaceSnapshotFileSet,
  notesDirName,
  snapshotsDirName,
  syntaxDirName,
} from "../../repository/workspaceRepositoryLayout.ts";
import {
  fsyncDirectory,
  writeFileDurably,
} from "./atomicWrite.ts";
import { hasFileSystemErrorCode } from "../../repository/fileSystemError.ts";

export const workspaceCommitPhases = {
  stagingCreated: "staging-created",
  filesDurable: "files-durable",
  snapshotPublished: "snapshot-published",
  headCommitted: "head-committed",
  cleanupCompleted: "cleanup-completed",
} as const;

export type WorkspaceCommitPhase =
  (typeof workspaceCommitPhases)[keyof typeof workspaceCommitPhases];

export async function writeImmutableSnapshot({
  content,
  onPhase = async () => {},
  revision,
  rootDir,
}: {
  content: WorkspaceRepositoryContentDto;
  onPhase?: (phase: WorkspaceCommitPhase) => Promise<void> | void;
  revision: RepositoryRevisionDto;
  rootDir: string;
}) {
  const snapshotsDir = path.join(rootDir, snapshotsDirName);
  const stagingDir = path.join(snapshotsDir, `.staging-${randomUUID()}`);
  const targetDir = path.join(snapshotsDir, revision);

  await mkdir(path.join(stagingDir, notesDirName), { recursive: true });
  await mkdir(path.join(stagingDir, syntaxDirName), { recursive: true });
  await onPhase(workspaceCommitPhases.stagingCreated);

  try {
    for (const [relativePath, source] of createWorkspaceSnapshotFileSet(content)) {
      await writeFileDurably(path.join(stagingDir, relativePath), source);
    }
    await fsyncDirectory(path.join(stagingDir, notesDirName));
    await fsyncDirectory(path.join(stagingDir, syntaxDirName));
    await fsyncDirectory(stagingDir);
    await onPhase(workspaceCommitPhases.filesDurable);

    try {
      await rename(stagingDir, targetDir);
    } catch (error) {
      if (!hasFileSystemErrorCode(error, "EEXIST") &&
          !hasFileSystemErrorCode(error, "ENOTEMPTY")) {
        throw error;
      }
      await rm(stagingDir, { force: true, recursive: true });
    }
    await fsyncDirectory(snapshotsDir);
    await onPhase(workspaceCommitPhases.snapshotPublished);
  } catch (error) {
    await rm(stagingDir, { force: true, recursive: true });
    throw error;
  }
}
