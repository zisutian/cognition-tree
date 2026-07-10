// SPDX-License-Identifier: GPL-3.0-or-later

import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomically } from "./atomicWrite.mjs";
import { assertWorkspaceManifestDto } from "./workspaceManifestDto.mjs";

const workspaceFileName = "workspace.json";
const notesDirName = "notes";
const transactionFileName = ".workspace-transaction.json";
const transactionDirName = ".workspace-transaction";
const nextNotesDirName = "next-notes";
const previousNotesDirName = "previous-notes";

export const workspaceCommitPhases = Object.freeze({
  prepared: "prepared",
  previousNotesMoved: "previous-notes-moved",
  notesCommitted: "notes-committed",
  manifestCommitted: "manifest-committed",
  cleanupCompleted: "cleanup-completed",
});

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function manifestsMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertWorkspaceTransaction(transaction) {
  if (
    !transaction ||
    typeof transaction !== "object" ||
    Array.isArray(transaction) ||
    transaction.version !== 1
  ) {
    throw new Error("Invalid workspace transaction");
  }

  assertWorkspaceManifestDto(transaction.manifest);
}

export class WorkspaceCommitTransaction {
  #rootDir;
  #onCommitPhase;

  constructor(rootDir, { onCommitPhase = async () => {} } = {}) {
    this.#rootDir = rootDir;
    this.#onCommitPhase = onCommitPhase;
  }

  async commit({ manifest, noteFiles }) {
    await this.#prepare(noteFiles, manifest);
    await this.#reachPhase(workspaceCommitPhases.prepared);

    await rename(this.#notesDir, this.#previousNotesDir);
    await this.#reachPhase(workspaceCommitPhases.previousNotesMoved);

    await rename(this.#nextNotesDir, this.#notesDir);
    await this.#reachPhase(workspaceCommitPhases.notesCommitted);

    await writeJsonAtomically(this.#manifestPath, manifest);
    await this.#reachPhase(workspaceCommitPhases.manifestCommitted);

    await rm(this.#previousNotesDir, { force: true, recursive: true });
    await this.#reachPhase(workspaceCommitPhases.cleanupCompleted);
    await this.remove();
  }

  async recover() {
    const transaction = await readJsonIfExists(this.#transactionPath);

    if (!transaction) {
      await rm(this.#transactionDir, { force: true, recursive: true });
      return;
    }

    assertWorkspaceTransaction(transaction);

    const currentManifest = await readJsonIfExists(this.#manifestPath);

    if (manifestsMatch(currentManifest, transaction.manifest)) {
      await this.#complete();
    } else {
      await this.#rollback();
    }

    await this.remove();
  }

  async remove() {
    await rm(this.#transactionDir, { force: true, recursive: true });
    await rm(this.#transactionPath, { force: true });
  }

  async #prepare(noteFiles, manifest) {
    await this.remove();
    await mkdir(this.#nextNotesDir, { recursive: true });

    for (const { relativePath, source } of noteFiles) {
      const filePath = path.join(
        this.#nextNotesDir,
        ...relativePath.split("/"),
      );

      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, source, "utf8");
    }

    await writeJsonAtomically(this.#transactionPath, {
      version: 1,
      manifest,
    });
  }

  async #complete() {
    if (await pathExists(this.#notesDir)) {
      return;
    }

    if (!(await pathExists(this.#nextNotesDir))) {
      throw new Error("Workspace transaction is missing committed notes");
    }

    await rename(this.#nextNotesDir, this.#notesDir);
  }

  async #rollback() {
    if (await pathExists(this.#previousNotesDir)) {
      await rm(this.#notesDir, { force: true, recursive: true });
      await rename(this.#previousNotesDir, this.#notesDir);
      return;
    }

    await mkdir(this.#notesDir, { recursive: true });
  }

  async #reachPhase(phase) {
    await this.#onCommitPhase(phase);
  }

  get #manifestPath() {
    return path.join(this.#rootDir, workspaceFileName);
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
}
