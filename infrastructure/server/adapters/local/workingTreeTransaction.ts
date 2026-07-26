// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import {
  mkdir,
  rm,
} from "node:fs/promises";
import path from "node:path";
import type {
  RepositoryRevisionDto,
} from "../../../../contracts/workspace/types.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
  WorkspaceRevisionConflictError,
} from "../../repository/repositoryStore.ts";
import {
  fsyncDirectory,
  writeFileDurably,
} from "../../persistence/fileSystemPersistence.ts";
import {
  localControlDirectoryName,
  localTransactionsDirectoryName,
  type LocalManagedFileSet,
} from "./localWorkingTreeLayout.ts";
import {
  applyLocalWorkingTreeTransaction,
  applyLocalWorkingTreeTransactionBody,
  applyLocalWorkingTreeTransactionHead,
  assertLocalWorkingTreeBodyMatchesTarget,
  ensureLocalWorkingTreeDirectory,
  readLocalWorkingTreeHeadRevision,
  removeObsoleteLocalWorkingTreeDirectories,
} from "./workingTreeTransactionExecutor.ts";
import {
  serializeLocalTransactionManifest,
  type LocalTransactionFileOperation,
  type LocalTransactionManifest,
} from "./workingTreeTransactionManifest.ts";
import {
  planLocalWorkingTreeTransaction,
} from "./workingTreeTransactionPlanner.ts";
import {
  assertRemovedDirectoriesAreManaged,
  captureLocalManagedWorkingTreeState,
  equalLocalManagedWorkingTreeState,
  type LocalManagedWorkingTreeState,
} from "./workingTreeTransactionState.ts";

export const workspaceCommitPhases = {
  stagingCreated: "staging-created",
  filesDurable: "files-durable",
  workingTreeApplied: "working-tree-applied",
  headCommitted: "head-committed",
  cleanupCompleted: "cleanup-completed",
} as const;

export type WorkspaceCommitPhase =
  (typeof workspaceCommitPhases)[keyof typeof workspaceCommitPhases];

async function prepareOperations(
  transactionDir: string,
  currentState: LocalManagedWorkingTreeState,
  targetFiles: LocalManagedFileSet,
) {
  const plan = planLocalWorkingTreeTransaction(
    currentState,
    targetFiles,
  );

  for (const operation of plan.operations) {
    if (
      operation.currentContent !== null &&
      operation.backupFile
    ) {
      await writeFileDurably(
        path.join(transactionDir, operation.backupFile),
        operation.currentContent,
      );
    }
    if (
      operation.targetContent !== null &&
      operation.stagedFile
    ) {
      await writeFileDurably(
        path.join(transactionDir, operation.stagedFile),
        operation.targetContent,
      );
    }
  }
  return {
    backupDirectories: plan.backupDirectories,
    operations: plan.operations.map(({
      currentContent: _currentContent,
      targetContent: _targetContent,
      ...operation
    }): LocalTransactionFileOperation => operation),
  };
}

export async function commitLocalWorkingTreeTransaction({
  baseRevision,
  onPhase = async () => {},
  rootDir,
  expectedCurrentState,
  targetDirectories,
  targetFiles,
  targetRevision,
}: {
  baseRevision: RepositoryRevisionDto;
  expectedCurrentState: LocalManagedWorkingTreeState;
  onPhase?: (phase: WorkspaceCommitPhase) => Promise<void> | void;
  rootDir: string;
  targetDirectories: readonly string[];
  targetFiles: LocalManagedFileSet;
  targetRevision: RepositoryRevisionDto;
}) {
  const transactionsDir = path.join(
    rootDir,
    localControlDirectoryName,
    localTransactionsDirectoryName,
  );
  const transactionDir = path.join(
    transactionsDir,
    randomUUID().toLowerCase(),
  );

  await mkdir(
    path.join(transactionDir, "backup"),
    { recursive: true, mode: 0o700 },
  );
  await mkdir(
    path.join(transactionDir, "staged"),
    { recursive: true, mode: 0o700 },
  );
  await onPhase(workspaceCommitPhases.stagingCreated);
  let manifest: LocalTransactionManifest | null = null;
  let bodyApplyStarted = false;

  try {
    const currentHead = await readLocalWorkingTreeHeadRevision(rootDir);

    if (currentHead !== baseRevision) {
      throw new WorkspaceRevisionConflictError(currentHead);
    }
    const capturedCurrentState =
      await captureLocalManagedWorkingTreeState(rootDir);

    if (
      !equalLocalManagedWorkingTreeState(
        capturedCurrentState,
        expectedCurrentState,
      )
    ) {
      throw new RepositoryAdapterError(
        "repository_busy",
        "Local repository changed before its transaction could be staged",
      );
    }
    const prepared = await prepareOperations(
      transactionDir,
      capturedCurrentState,
      targetFiles,
    );

    await assertRemovedDirectoriesAreManaged(
      rootDir,
      prepared.backupDirectories,
      targetDirectories,
    );
    manifest = {
      backupDirectories: prepared.backupDirectories,
      baseRevision,
      operations: prepared.operations,
      schemaVersion: 1,
      targetDirectories: [...targetDirectories],
      targetRevision,
    };
    await writeFileDurably(
      path.join(transactionDir, "manifest.json"),
      serializeLocalTransactionManifest(manifest),
    );
    await fsyncDirectory(path.join(transactionDir, "backup"));
    await fsyncDirectory(path.join(transactionDir, "staged"));
    await fsyncDirectory(transactionDir);
    await fsyncDirectory(transactionsDir);
    await onPhase(workspaceCommitPhases.filesDurable);

    const stateBeforeApply =
      await captureLocalManagedWorkingTreeState(rootDir);

    if (
      !equalLocalManagedWorkingTreeState(
        stateBeforeApply,
        capturedCurrentState,
      )
    ) {
      throw new RepositoryAdapterError(
        "repository_busy",
        "Local repository changed while its transaction was being prepared",
      );
    }
    bodyApplyStarted = true;
    for (const directory of manifest.targetDirectories) {
      await ensureLocalWorkingTreeDirectory(rootDir, directory);
    }
    await applyLocalWorkingTreeTransactionBody(
      transactionDir,
      rootDir,
      manifest,
    );
    await removeObsoleteLocalWorkingTreeDirectories(
      rootDir,
      manifest.backupDirectories,
      new Set(manifest.targetDirectories),
    );
    await assertLocalWorkingTreeBodyMatchesTarget(
      rootDir,
      targetFiles,
      manifest.targetDirectories,
    );
    await onPhase(workspaceCommitPhases.workingTreeApplied);
    await applyLocalWorkingTreeTransactionHead(
      transactionDir,
      rootDir,
      manifest,
    );

    // repository.json is the sole commit point and is always applied last.
    await Promise.resolve()
      .then(() => onPhase(workspaceCommitPhases.headCommitted))
      .catch(() => undefined);
    const cleaned = await rm(
      transactionDir,
      { force: true, recursive: true },
    ).then(() => true, () => false);

    if (cleaned) {
      await fsyncDirectory(transactionsDir).catch(() => undefined);
      await Promise.resolve()
        .then(() => onPhase(workspaceCommitPhases.cleanupCompleted))
        .catch(() => undefined);
    }
  } catch (error) {
    if (manifest && !bodyApplyStarted) {
      await rm(
        transactionDir,
        { force: true, recursive: true },
      ).catch(() => undefined);
      await fsyncDirectory(transactionsDir).catch(() => undefined);
    } else if (manifest) {
      const headRevision = await readLocalWorkingTreeHeadRevision(
        rootDir,
      ).catch(() => null);

      if (headRevision === baseRevision) {
        try {
          await applyLocalWorkingTreeTransaction(
            transactionDir,
            rootDir,
            manifest,
            "backup",
          );
          await rm(
            transactionDir,
            { force: true, recursive: true },
          );
          await fsyncDirectory(transactionsDir);
        } catch (rollbackError) {
          const failure = new RepositoryCorruptError(
            "Local transaction failed and unknown external changes prevented rollback",
          ) as RepositoryCorruptError & { failures?: unknown[] };

          failure.failures = [error, rollbackError];
          throw failure;
        }
      } else if (headRevision === targetRevision) {
        // The head is the commit point. Keep any remaining WAL for startup
        // roll-forward, but never report a committed target as a failed save.
        return;
      } else {
        const failure = new RepositoryCorruptError(
          "Local transaction head matches neither base nor target revision",
        ) as RepositoryCorruptError & { failures?: unknown[] };

        failure.failures = [error];
        throw failure;
      }
    } else {
      await rm(
        transactionDir,
        { force: true, recursive: true },
      ).catch(() => undefined);
    }
    throw error;
  }
}
