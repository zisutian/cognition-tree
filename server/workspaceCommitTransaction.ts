// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { repositorySyntaxFileName } from "../contracts/workspace-repository/types.ts";
import { writeJsonAtomically } from "./atomicWrite.ts";
import { hasFileSystemErrorCode } from "./fileSystemError.ts";
import {
  parseWorkspaceManifest,
  type WorkspaceManifest,
} from "./workspaceManifest.ts";

const workspaceFileName = "workspace.json";
const notesDirName = "notes";
const syntaxDirName = "syntax";
const commitMarkerFileName = ".workspace-commit.json";
const transactionFileName = ".workspace-transaction.json";
const transactionDirName = ".workspace-transaction";
const nextNotesDirName = "next-notes";
const previousNotesDirName = "previous-notes";
const nextSyntaxDirName = "next-syntax";
const previousSyntaxDirName = "previous-syntax";

export const workspaceCommitPhases = {
  prepared: "prepared",
  previousNotesMoved: "previous-notes-moved",
  previousSyntaxMoved: "previous-syntax-moved",
  notesCommitted: "notes-committed",
  syntaxCommitted: "syntax-committed",
  manifestCommitted: "manifest-committed",
  commitMarked: "commit-marked",
  cleanupCompleted: "cleanup-completed",
} as const;

export type WorkspaceCommitPhase =
  (typeof workspaceCommitPhases)[keyof typeof workspaceCommitPhases];

type WorkspaceTransaction = {
  commitId: string;
  manifest: WorkspaceManifest;
  previousManifest: WorkspaceManifest | null;
  version: 2;
};

type WorkspaceCommitInput = {
  manifest: WorkspaceManifest;
  noteFiles: Array<{ relativePath: string; source: string }>;
  syntaxSource: string | null;
};

type WorkspaceCommitTransactionOptions = {
  onCommitPhase?: (phase: WorkspaceCommitPhase) => Promise<void> | void;
};

async function readJsonIfExists(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ENOENT")) {
      return null;
    }

    throw error;
  }
}

async function pathExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ENOENT")) {
      return false;
    }

    throw error;
  }
}

function parseWorkspaceTransaction(value: unknown): WorkspaceTransaction {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("Invalid workspace transaction");
  }

  const transaction = value as Record<string, unknown>;

  if (
    transaction.version !== 2 ||
    typeof transaction.commitId !== "string" ||
    transaction.commitId.length === 0
  ) {
    throw new Error("Invalid workspace transaction");
  }

  return {
    commitId: transaction.commitId,
    manifest: parseWorkspaceManifest(transaction.manifest),
    previousManifest: transaction.previousManifest === null
      ? null
      : parseWorkspaceManifest(transaction.previousManifest),
    version: 2,
  };
}

export class WorkspaceCommitTransaction {
  #rootDir: string;
  #onCommitPhase: NonNullable<
    WorkspaceCommitTransactionOptions["onCommitPhase"]
  >;

  constructor(
    rootDir: string,
    { onCommitPhase = async () => {} }: WorkspaceCommitTransactionOptions = {},
  ) {
    this.#rootDir = rootDir;
    this.#onCommitPhase = onCommitPhase;
  }

  async commit({ manifest, noteFiles, syntaxSource }: WorkspaceCommitInput) {
    const transaction = await this.#prepare({
      manifest,
      noteFiles,
      syntaxSource,
    });

    await this.#reachPhase(workspaceCommitPhases.prepared);

    await rename(this.#notesDir, this.#previousNotesDir);
    await this.#reachPhase(workspaceCommitPhases.previousNotesMoved);

    await rename(this.#syntaxDir, this.#previousSyntaxDir);
    await this.#reachPhase(workspaceCommitPhases.previousSyntaxMoved);

    await rename(this.#nextNotesDir, this.#notesDir);
    await this.#reachPhase(workspaceCommitPhases.notesCommitted);

    await rename(this.#nextSyntaxDir, this.#syntaxDir);
    await this.#reachPhase(workspaceCommitPhases.syntaxCommitted);

    await writeJsonAtomically(this.#manifestPath, manifest);
    await this.#reachPhase(workspaceCommitPhases.manifestCommitted);

    await writeJsonAtomically(this.#commitMarkerPath, {
      commitId: transaction.commitId,
    });
    await this.#reachPhase(workspaceCommitPhases.commitMarked);

    await rm(this.#previousNotesDir, { force: true, recursive: true });
    await rm(this.#previousSyntaxDir, { force: true, recursive: true });
    await this.#reachPhase(workspaceCommitPhases.cleanupCompleted);
    await this.remove();
  }

  async recover() {
    const value = await readJsonIfExists(this.#transactionPath);

    if (!value) {
      await rm(this.#transactionDir, { force: true, recursive: true });
      return;
    }

    const transaction = parseWorkspaceTransaction(value);

    const commitMarker = await readJsonIfExists(this.#commitMarkerPath);

    if (
      typeof commitMarker === "object" &&
      commitMarker !== null &&
      "commitId" in commitMarker &&
      commitMarker.commitId === transaction.commitId
    ) {
      await this.#complete(transaction);
    } else {
      await this.#rollback(transaction);
    }

    await this.remove();
  }

  async remove() {
    await rm(this.#transactionDir, { force: true, recursive: true });
    await rm(this.#transactionPath, { force: true });
  }

  async #prepare({
    manifest,
    noteFiles,
    syntaxSource,
  }: WorkspaceCommitInput): Promise<WorkspaceTransaction> {
    await this.remove();
    await mkdir(this.#nextNotesDir, { recursive: true });
    await mkdir(this.#nextSyntaxDir, { recursive: true });

    for (const { relativePath, source } of noteFiles) {
      const filePath = path.join(
        this.#nextNotesDir,
        ...relativePath.split("/"),
      );

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, source, "utf8");
    }

    if (syntaxSource !== null) {
      await writeFile(
        path.join(this.#nextSyntaxDir, repositorySyntaxFileName),
        syntaxSource,
        "utf8",
      );
    }

    const transaction: WorkspaceTransaction = {
      commitId: randomUUID(),
      manifest,
      previousManifest: await readJsonIfExists(this.#manifestPath).then(
        (previousManifest) => previousManifest === null
          ? null
          : parseWorkspaceManifest(previousManifest),
      ),
      version: 2,
    };

    await writeJsonAtomically(this.#transactionPath, transaction);
    return transaction;
  }

  async #complete(transaction: WorkspaceTransaction) {
    await this.#completeDirectory(
      this.#notesDir,
      this.#nextNotesDir,
      "notes",
    );
    await this.#completeDirectory(
      this.#syntaxDir,
      this.#nextSyntaxDir,
      "syntax",
    );
    await writeJsonAtomically(this.#manifestPath, transaction.manifest);
    await rm(this.#previousNotesDir, { force: true, recursive: true });
    await rm(this.#previousSyntaxDir, { force: true, recursive: true });
  }

  async #completeDirectory(
    currentDir: string,
    nextDir: string,
    label: string,
  ) {
    if (await pathExists(currentDir)) {
      return;
    }

    if (!(await pathExists(nextDir))) {
      throw new Error(`Workspace transaction is missing committed ${label}`);
    }

    await rename(nextDir, currentDir);
  }

  async #rollback(transaction: WorkspaceTransaction) {
    await this.#rollbackDirectory(
      this.#notesDir,
      this.#previousNotesDir,
    );
    await this.#rollbackDirectory(
      this.#syntaxDir,
      this.#previousSyntaxDir,
    );

    if (transaction.previousManifest) {
      await writeJsonAtomically(
        this.#manifestPath,
        transaction.previousManifest,
      );
    } else {
      await rm(this.#manifestPath, { force: true });
    }
  }

  async #rollbackDirectory(currentDir: string, previousDir: string) {
    if (await pathExists(previousDir)) {
      await rm(currentDir, { force: true, recursive: true });
      await rename(previousDir, currentDir);
      return;
    }

    if (!(await pathExists(currentDir))) {
      await mkdir(currentDir, { recursive: true });
    }
  }

  async #reachPhase(phase: WorkspaceCommitPhase) {
    await this.#onCommitPhase(phase);
  }

  get #manifestPath() {
    return path.join(this.#rootDir, workspaceFileName);
  }

  get #commitMarkerPath() {
    return path.join(this.#rootDir, commitMarkerFileName);
  }

  get #notesDir() {
    return path.join(this.#rootDir, notesDirName);
  }

  get #transactionPath() {
    return path.join(this.#rootDir, transactionFileName);
  }

  get #transactionDir() {
    return path.join(this.#rootDir, transactionDirName);
  }

  get #nextNotesDir() {
    return path.join(this.#transactionDir, nextNotesDirName);
  }

  get #previousNotesDir() {
    return path.join(this.#transactionDir, previousNotesDirName);
  }

  get #syntaxDir() {
    return path.join(this.#rootDir, syntaxDirName);
  }

  get #nextSyntaxDir() {
    return path.join(this.#transactionDir, nextSyntaxDirName);
  }

  get #previousSyntaxDir() {
    return path.join(this.#transactionDir, previousSyntaxDirName);
  }
}
