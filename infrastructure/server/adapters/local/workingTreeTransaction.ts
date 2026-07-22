// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  rm,
  rmdir,
} from "node:fs/promises";
import path from "node:path";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import { parseRepositoryRevision } from "../../../../contracts/workspace/revision.ts";
import type { RepositoryRevisionDto } from "../../../../contracts/workspace/types.ts";
import {
  RepositoryAdapterError,
  RepositoryCorruptError,
  WorkspaceRevisionConflictError,
} from "../../repository/repositoryStore.ts";
import { hasFileSystemErrorCode } from "../../repository/fileSystemError.ts";
import {
  fsyncDirectory,
  writeFileAtomically,
  writeFileDurably,
} from "./atomicWrite.ts";
import {
  localControlDirectoryName,
  localIndexFileName,
  localNoteMetadataDirectoryName,
  localRepositoryMetadataFileName,
  localSyntaxDirectoryName,
  localTransactionsDirectoryName,
  parseLocalRepositoryMetadata,
  readLocalJson,
  type LocalManagedFileSet,
} from "./localWorkingTree.ts";

export type LocalManagedWorkingTreeState = {
  directories: Set<string>;
  files: LocalManagedFileSet;
};

export const workspaceCommitPhases = {
  stagingCreated: "staging-created",
  filesDurable: "files-durable",
  workingTreeApplied: "working-tree-applied",
  headCommitted: "head-committed",
  cleanupCompleted: "cleanup-completed",
} as const;

export type WorkspaceCommitPhase =
  (typeof workspaceCommitPhases)[keyof typeof workspaceCommitPhases];

type FileOperation = {
  backupFile: string | null;
  baseHash: string;
  path: string;
  stagedFile: string | null;
  targetHash: string;
};

type TransactionManifest = {
  backupDirectories: string[];
  baseRevision: RepositoryRevisionDto;
  operations: FileOperation[];
  schemaVersion: 1;
  targetDirectories: string[];
  targetRevision: RepositoryRevisionDto;
};

const manifestFields = new Set([
  "backupDirectories",
  "baseRevision",
  "operations",
  "schemaVersion",
  "targetDirectories",
  "targetRevision",
]);
const operationFields = new Set([
  "backupFile",
  "baseHash",
  "path",
  "stagedFile",
  "targetHash",
]);
const transactionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonSource(value: unknown) {
  return `${serializeJsonIteratively(value, { indent: 2 })}\n`;
}

function contentHash(source: string | null) {
  return source === null
    ? "absent"
    : `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function isContentHash(value: unknown): value is string {
  return value === "absent" ||
    (typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value));
}

function assertSafeRelativePath(value: string, label: string) {
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new RepositoryCorruptError(`${label} is unsafe`);
  }
}

function parseManifest(value: unknown): TransactionManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RepositoryCorruptError("Local transaction manifest is invalid");
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 ||
      Object.keys(record).some((key) => !manifestFields.has(key)) ||
      [...manifestFields].some((key) => !(key in record)) ||
      typeof record.baseRevision !== "string" ||
      typeof record.targetRevision !== "string" ||
      !Array.isArray(record.backupDirectories) ||
      !Array.isArray(record.operations) ||
      !Array.isArray(record.targetDirectories)) {
    throw new RepositoryCorruptError("Local transaction manifest is invalid");
  }
  const operations = record.operations.map((value, index): FileOperation => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new RepositoryCorruptError("Local transaction operation is invalid");
    }
    const operation = value as Record<string, unknown>;
    if (Object.keys(operation).some((key) => !operationFields.has(key)) ||
        [...operationFields].some((key) => !(key in operation)) ||
        typeof operation.path !== "string" ||
        !isContentHash(operation.baseHash) ||
        !isContentHash(operation.targetHash) ||
        !(operation.backupFile === null || typeof operation.backupFile === "string") ||
        !(operation.stagedFile === null || typeof operation.stagedFile === "string")) {
      throw new RepositoryCorruptError(`Local transaction operation ${index} is invalid`);
    }
    assertSafeRelativePath(operation.path, `Local transaction operation ${index}`);
    if (typeof operation.backupFile === "string") {
      assertSafeRelativePath(operation.backupFile, `Local transaction backup ${index}`);
      if (!/^backup\/\d{6}$/.test(operation.backupFile)) {
        throw new RepositoryCorruptError(`Local transaction backup ${index} is invalid`);
      }
    }
    if (typeof operation.stagedFile === "string") {
      assertSafeRelativePath(operation.stagedFile, `Local transaction staged file ${index}`);
      if (!/^staged\/\d{6}$/.test(operation.stagedFile)) {
        throw new RepositoryCorruptError(`Local transaction staged file ${index} is invalid`);
      }
    }
    return {
      backupFile: operation.backupFile,
      baseHash: operation.baseHash,
      path: operation.path,
      stagedFile: operation.stagedFile,
      targetHash: operation.targetHash,
    };
  });
  const targetDirectories = record.targetDirectories.map((value, index) => {
    if (typeof value !== "string") {
      throw new RepositoryCorruptError(`Local transaction directory ${index} is invalid`);
    }
    assertSafeRelativePath(value, `Local transaction directory ${index}`);
    return value;
  });
  const backupDirectories = record.backupDirectories.map((value, index) => {
    if (typeof value !== "string") {
      throw new RepositoryCorruptError(`Local transaction backup directory ${index} is invalid`);
    }
    assertSafeRelativePath(value, `Local transaction backup directory ${index}`);
    return value;
  });
  const operationPaths = operations.map((operation) => operation.path);
  const backupFiles = operations.flatMap((operation) =>
    operation.backupFile === null ? [] : [operation.backupFile]
  );
  const stagedFiles = operations.flatMap((operation) =>
    operation.stagedFile === null ? [] : [operation.stagedFile]
  );
  if (new Set(operationPaths).size !== operationPaths.length ||
      new Set(backupFiles).size !== backupFiles.length ||
      new Set(stagedFiles).size !== stagedFiles.length ||
      new Set(targetDirectories).size !== targetDirectories.length ||
      new Set(backupDirectories).size !== backupDirectories.length) {
    throw new RepositoryCorruptError("Local transaction manifest contains duplicate paths");
  }
  let baseRevision: RepositoryRevisionDto;
  let targetRevision: RepositoryRevisionDto;
  try {
    baseRevision = parseRepositoryRevision(record.baseRevision);
    targetRevision = parseRepositoryRevision(record.targetRevision);
  } catch {
    throw new RepositoryCorruptError("Local transaction revisions are invalid");
  }
  return {
    backupDirectories,
    baseRevision,
    operations,
    schemaVersion: 1,
    targetDirectories,
    targetRevision,
  };
}

async function pathType(filePath: string) {
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

type FileSystemIdentity = {
  device: string;
  inode: string;
};

function fileSystemIdentity(stats: Awaited<ReturnType<typeof lstat>>): FileSystemIdentity {
  return { device: String(stats.dev), inode: String(stats.ino) };
}

function equalFileSystemIdentities(
  left: readonly FileSystemIdentity[],
  right: readonly FileSystemIdentity[],
) {
  return left.length === right.length && left.every((identity, index) =>
    identity.device === right[index]?.device && identity.inode === right[index]?.inode
  );
}

async function assertSafeParentChain(rootDir: string, relativePath: string) {
  const parentSegments = path.posix.dirname(relativePath) === "."
    ? []
    : path.posix.dirname(relativePath).split("/");
  let current = rootDir;
  const identities: FileSystemIdentity[] = [];
  for (const segment of parentSegments) {
    current = path.join(current, segment);
    const type = await pathType(current);
    if (type === null) return identities;
    if (type !== "directory") {
      throw new RepositoryCorruptError("Local managed path has an unsafe parent");
    }
    const stats = await lstat(current);
    identities.push(fileSystemIdentity(stats));
  }
  return identities;
}

async function readManagedFile(rootDir: string, relativePath: string) {
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
      throw new RepositoryCorruptError("Local managed file must be a private regular file");
    }
    const source = await handle.readFile("utf8");
    const after = await handle.stat();
    if (!after.isFile() || after.nlink > 1 || before.dev !== after.dev ||
        before.ino !== after.ino || before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs) {
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
      throw new RepositoryCorruptError("Local managed file must not be a symbolic link");
    }
    throw error;
  } finally {
    await handle?.close();
  }
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
      throw new RepositoryCorruptError("Local transaction payload parent is unsafe");
    }
    identities.push(fileSystemIdentity(stats));
  }
  return identities;
}

async function readTransactionFile(
  transactionDir: string,
  sourceRelativePath: string,
) {
  const filePath = path.join(transactionDir, ...sourceRelativePath.split("/"));
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
      throw new RepositoryCorruptError("Local transaction payload is unsafe");
    }
    const source = await handle.readFile("utf8");
    const after = await handle.stat();
    if (!after.isFile() || after.nlink > 1 || stats.dev !== after.dev ||
        stats.ino !== after.ino || stats.size !== after.size ||
        stats.mtimeMs !== after.mtimeMs) {
      throw new RepositoryCorruptError("Local transaction payload changed while being read");
    }
    const parentsAfter = await captureTransactionParentIdentities(
      transactionDir,
      sourceRelativePath,
    );
    if (!equalFileSystemIdentities(parentsBefore, parentsAfter)) {
      throw new RepositoryCorruptError("Local transaction payload parent changed while being read");
    }
    return source;
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ELOOP")) {
      throw new RepositoryCorruptError("Local transaction payload is a symbolic link");
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
    const directoryPath = relativeDirectory ? path.join(rootDir, ...relativeDirectory.split("/")) : rootDir;
    const before = await lstat(directoryPath);
    if (!before.isDirectory() || before.isSymbolicLink()) {
      throw new RepositoryCorruptError("Local managed directory is unsafe");
    }
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!relativeDirectory && entry.name === localControlDirectoryName) continue;
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolutePath = path.join(rootDir, ...relativePath.split("/"));
      const stats = await lstat(absolutePath);
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) {
        directories.add(relativePath);
        pending.push(relativePath);
      } else if (stats.isFile() && entry.name.endsWith(".ctn")) {
        files.add(relativePath);
      }
    }
    const after = await lstat(directoryPath);
    if (!after.isDirectory() || after.isSymbolicLink() ||
        before.dev !== after.dev || before.ino !== after.ino ||
        before.mtimeMs !== after.mtimeMs) {
      throw new RepositoryAdapterError(
        "repository_busy",
        "Local managed directory changed while it was being scanned",
      );
    }
  }
  const controlFiles = [
    `${localControlDirectoryName}/${localIndexFileName}`,
    `${localControlDirectoryName}/${localRepositoryMetadataFileName}`,
  ];
  for (const relativePath of controlFiles) {
    if (await pathType(path.join(rootDir, ...relativePath.split("/"))) === "file") {
      files.add(relativePath);
    }
  }
  const metadataDirectory = path.join(rootDir, localControlDirectoryName, localNoteMetadataDirectoryName);
  const metadataEntries = await readdir(metadataDirectory, { withFileTypes: true }).catch((error: unknown) => {
    if (hasFileSystemErrorCode(error, "ENOENT")) return [];
    throw error;
  });
  for (const entry of metadataEntries) {
    if (entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".json")) {
      files.add(`${localControlDirectoryName}/${localNoteMetadataDirectoryName}/${entry.name}`);
    }
  }
  const syntaxDirectory = path.join(
    rootDir,
    localControlDirectoryName,
    localSyntaxDirectoryName,
  );
  const syntaxEntries = await readdir(syntaxDirectory, { withFileTypes: true }).catch(
    (error: unknown) => {
      if (hasFileSystemErrorCode(error, "ENOENT")) return [];
      throw error;
    },
  );
  for (const entry of syntaxEntries) {
    if (entry.isFile() && !entry.isSymbolicLink()) {
      files.add(`${localControlDirectoryName}/${localSyntaxDirectoryName}/${entry.name}`);
    }
  }
  return { directories, files };
}

async function containsUnmanagedEntry(rootDir: string, relativeDirectory: string) {
  const pending = [relativeDirectory];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    const entries = await readdir(path.join(rootDir, ...current.split("/")), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const child = `${current}/${entry.name}`;
      const stats = await lstat(path.join(rootDir, ...child.split("/")));
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

async function assertRemovedDirectoriesAreManaged(
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

function parentDirectories(relativePath: string) {
  const result: string[] = [];
  let current = path.posix.dirname(relativePath);
  while (current !== ".") {
    result.push(current);
    current = path.posix.dirname(current);
  }
  return result.reverse();
}

async function ensureDirectory(rootDir: string, relativePath: string) {
  const segments = relativePath.split("/");
  let current = rootDir;
  for (const segment of segments) {
    current = path.join(current, segment);
    const type = await pathType(current);
    if (type === null) {
      await mkdir(current, { mode: 0o700 });
      await fsyncDirectory(path.dirname(current));
    } else if (type !== "directory") {
      throw new RepositoryCorruptError("Local target directory is occupied by another entry");
    }
  }
}

async function applyFile(
  transactionDir: string,
  rootDir: string,
  operation: FileOperation,
  direction: "backup" | "staged",
) {
  const sourceRelativePath = direction === "backup" ? operation.backupFile : operation.stagedFile;
  const targetPath = path.join(rootDir, ...operation.path.split("/"));
  const currentSource = await readManagedFile(rootDir, operation.path);
  const currentHash = contentHash(currentSource);
  if (currentHash !== operation.baseHash && currentHash !== operation.targetHash) {
    throw new RepositoryCorruptError(
      "Local transaction found an externally modified managed file",
    );
  }
  if (sourceRelativePath === null) {
    const type = await pathType(targetPath);
    if (type === "file") {
      await rm(targetPath);
      await fsyncDirectory(path.dirname(targetPath));
    } else if (type !== null) {
      throw new RepositoryCorruptError("Local transaction target changed type");
    }
    return;
  }
  await ensureDirectory(rootDir, path.posix.dirname(operation.path));
  const source = await readTransactionFile(transactionDir, sourceRelativePath);
  const expectedSourceHash = direction === "backup"
    ? operation.baseHash
    : operation.targetHash;
  if (contentHash(source) !== expectedSourceHash) {
    throw new RepositoryCorruptError("Local transaction payload hash is invalid");
  }
  const type = await pathType(targetPath);
  if (type !== null && type !== "file") {
    throw new RepositoryCorruptError("Local transaction target is occupied");
  }
  await writeFileAtomically(targetPath, source);
}

async function removeObsoleteDirectories(
  rootDir: string,
  candidateDirectories: readonly string[],
  desiredDirectories: ReadonlySet<string>,
) {
  const candidates = candidateDirectories
    .filter((directory) => !desiredDirectories.has(directory))
    .sort((left, right) => right.split("/").length - left.split("/").length);
  for (const directory of candidates) {
    await rmdir(path.join(rootDir, ...directory.split("/"))).catch((error: unknown) => {
      if (!hasFileSystemErrorCode(error, "ENOTEMPTY") && !hasFileSystemErrorCode(error, "ENOENT")) {
        throw error;
      }
    });
  }
}

async function applyTransaction(
  transactionDir: string,
  rootDir: string,
  manifest: TransactionManifest,
  direction: "backup" | "staged",
) {
  const desiredDirectories = direction === "staged"
    ? manifest.targetDirectories
    : manifest.backupDirectories;
  for (const directory of desiredDirectories) {
    await ensureDirectory(rootDir, directory);
  }
  const targetDirectories = new Set(desiredDirectories);
  const headPath = `${localControlDirectoryName}/${localRepositoryMetadataFileName}`;
  for (const operation of manifest.operations) {
    if (operation.path !== headPath) {
      await applyFile(transactionDir, rootDir, operation, direction);
    }
  }
  const headOperation = manifest.operations.find((operation) => operation.path === headPath);
  if (headOperation) {
    await applyFile(transactionDir, rootDir, headOperation, direction);
  }
  await removeObsoleteDirectories(
    rootDir,
    direction === "staged" ? manifest.backupDirectories : manifest.targetDirectories,
    targetDirectories,
  );
}

async function applyTransactionBody(
  transactionDir: string,
  rootDir: string,
  manifest: TransactionManifest,
) {
  const headPath = `${localControlDirectoryName}/${localRepositoryMetadataFileName}`;
  for (const operation of manifest.operations) {
    if (operation.path !== headPath) {
      await applyFile(transactionDir, rootDir, operation, "staged");
    }
  }
}

async function applyTransactionHead(
  transactionDir: string,
  rootDir: string,
  manifest: TransactionManifest,
) {
  const headPath = `${localControlDirectoryName}/${localRepositoryMetadataFileName}`;
  const headOperation = manifest.operations.find((operation) => operation.path === headPath);
  if (!headOperation) {
    if (manifest.baseRevision === manifest.targetRevision) return;
    throw new RepositoryCorruptError("Local transaction did not stage repository head");
  }
  await applyFile(transactionDir, rootDir, headOperation, "staged");
}

async function readHeadRevision(rootDir: string) {
  return parseLocalRepositoryMetadata(await readLocalJson(
    path.join(rootDir, localControlDirectoryName, localRepositoryMetadataFileName),
  )).currentRevision;
}

async function assertTransactionPayloadLayout(
  transactionDir: string,
  manifest: TransactionManifest,
) {
  const rootEntries = await readdir(transactionDir, { withFileTypes: true });
  const expectedRootEntries = new Set(["backup", "manifest.json", "staged"]);
  if (rootEntries.length !== expectedRootEntries.size ||
      rootEntries.some((entry) => !expectedRootEntries.has(entry.name))) {
    throw new RepositoryCorruptError("Local transaction contains unknown data");
  }
  for (const directoryName of ["backup", "staged"] as const) {
    const directoryPath = path.join(transactionDir, directoryName);
    const directoryStats = await lstat(directoryPath);
    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
      throw new RepositoryCorruptError("Local transaction payload directory is unsafe");
    }
    const expectedNames = new Set(
      manifest.operations.flatMap((operation) => {
        const payload = directoryName === "backup"
          ? operation.backupFile
          : operation.stagedFile;
        return payload === null ? [] : [path.posix.basename(payload)];
      }),
    );
    const entries = await readdir(directoryPath, { withFileTypes: true });
    if (entries.length !== expectedNames.size ||
        entries.some((entry) => !expectedNames.has(entry.name))) {
      throw new RepositoryCorruptError("Local transaction payload set is invalid");
    }
    for (const entry of entries) {
      const stats = await lstat(path.join(directoryPath, entry.name));
      if (!entry.isFile() || entry.isSymbolicLink() || !stats.isFile() ||
          stats.isSymbolicLink() || stats.nlink > 1) {
        throw new RepositoryCorruptError("Local transaction payload file is unsafe");
      }
    }
  }
  const manifestStats = await lstat(path.join(transactionDir, "manifest.json"));
  if (!manifestStats.isFile() || manifestStats.isSymbolicLink() || manifestStats.nlink > 1) {
    throw new RepositoryCorruptError("Local transaction manifest is unsafe");
  }
}

export async function recoverLocalWorkingTreeTransactions(rootDir: string) {
  const transactionsDir = path.join(rootDir, localControlDirectoryName, localTransactionsDirectoryName);
  const entries = await readdir(transactionsDir, { withFileTypes: true }).catch((error: unknown) => {
    if (hasFileSystemErrorCode(error, "ENOENT")) return [];
    throw error;
  });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new RepositoryCorruptError("Local transaction directory contains an invalid entry");
    }
    if (!transactionPattern.test(entry.name)) {
      throw new RepositoryCorruptError("Local transaction directory contains an unknown entry");
    }
    const transactionDir = path.join(transactionsDir, entry.name);
    const transactionStats = await lstat(transactionDir);
    if (!transactionStats.isDirectory() || transactionStats.isSymbolicLink()) {
      throw new RepositoryCorruptError("Local transaction directory is unsafe");
    }
    const manifestPath = path.join(transactionDir, "manifest.json");
    const manifestValue = await readLocalJson(manifestPath).catch((error: unknown) => {
      if (hasFileSystemErrorCode(error, "ENOENT")) return null;
      throw error;
    });
    if (manifestValue === null) {
      await rm(transactionDir, { force: true, recursive: true });
      continue;
    }
    const manifest = parseManifest(manifestValue);
    await assertTransactionPayloadLayout(transactionDir, manifest);
    const headRevision = await readHeadRevision(rootDir);
    if (headRevision === manifest.baseRevision) {
      await applyTransaction(transactionDir, rootDir, manifest, "backup");
    } else if (headRevision === manifest.targetRevision) {
      await applyTransaction(transactionDir, rootDir, manifest, "staged");
    } else {
      throw new RepositoryCorruptError("Local transaction head matches neither transaction state");
    }
    await rm(transactionDir, { force: true, recursive: true });
    await fsyncDirectory(transactionsDir);
  }
}

async function prepareOperations(
  transactionDir: string,
  currentState: LocalManagedWorkingTreeState,
  targetFiles: LocalManagedFileSet,
) {
  const allPaths = new Set([...currentState.files.keys(), ...targetFiles.keys()]);
  const operations: FileOperation[] = [];
  let operationIndex = 0;
  for (const relativePath of [...allPaths].sort()) {
    const current = currentState.files.get(relativePath) ?? null;
    const target = targetFiles.get(relativePath) ?? null;
    if (current === target) continue;
    const stem = String(operationIndex).padStart(6, "0");
    const backupFile = current === null ? null : `backup/${stem}`;
    const stagedFile = target === null ? null : `staged/${stem}`;
    if (current !== null && backupFile) {
      await writeFileDurably(path.join(transactionDir, backupFile), current);
    }
    if (target !== null && stagedFile) {
      await writeFileDurably(path.join(transactionDir, stagedFile), target);
    }
    operations.push({
      backupFile,
      baseHash: contentHash(current),
      path: relativePath,
      stagedFile,
      targetHash: contentHash(target),
    });
    operationIndex += 1;
  }
  return {
    backupDirectories: [...currentState.directories].sort(),
    operations,
  };
}

export async function localWorkingTreeMatchesTarget(
  rootDir: string,
  targetFiles: LocalManagedFileSet,
  targetDirectories: readonly string[],
) {
  const current = await captureLocalManagedWorkingTreeState(rootDir);
  if (current.files.size !== targetFiles.size ||
      !equalStringSets(current.directories, new Set(targetDirectories))) return false;
  for (const [relativePath, target] of targetFiles) {
    if (current.files.get(relativePath) !== target) return false;
  }
  return true;
}

export async function captureLocalManagedWorkingTreeState(
  rootDir: string,
): Promise<LocalManagedWorkingTreeState> {
  const { directories, files } = await collectManagedFiles(rootDir);
  const result: LocalManagedFileSet = new Map();
  for (const relativePath of files) {
    const source = await readManagedFile(rootDir, relativePath);
    if (source === null) {
      throw new RepositoryCorruptError("Local managed file disappeared while being captured");
    }
    result.set(relativePath, source);
  }
  return { directories, files: result };
}

function equalManagedFiles(left: LocalManagedFileSet, right: LocalManagedFileSet) {
  return left.size === right.size &&
    [...left].every(([relativePath, source]) => right.get(relativePath) === source);
}

function equalStringSets(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

export function equalLocalManagedWorkingTreeState(
  left: LocalManagedWorkingTreeState,
  right: LocalManagedWorkingTreeState,
) {
  return equalManagedFiles(left.files, right.files) &&
    equalStringSets(left.directories, right.directories);
}

async function assertWorkingTreeBodyMatchesTarget(
  rootDir: string,
  targetFiles: LocalManagedFileSet,
  targetDirectories: readonly string[],
) {
  const current = await captureLocalManagedWorkingTreeState(rootDir);
  const headPath = `${localControlDirectoryName}/${localRepositoryMetadataFileName}`;
  const expected = new Map(targetFiles);
  expected.set(headPath, current.files.get(headPath) ?? "");
  if (!equalManagedFiles(current.files, expected) ||
      !equalStringSets(current.directories, new Set(targetDirectories))) {
    throw new RepositoryCorruptError(
      "Local working tree does not match the staged target before head publication",
    );
  }
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
  const transactionsDir = path.join(rootDir, localControlDirectoryName, localTransactionsDirectoryName);
  const transactionDir = path.join(transactionsDir, randomUUID().toLowerCase());
  await mkdir(path.join(transactionDir, "backup"), { recursive: true, mode: 0o700 });
  await mkdir(path.join(transactionDir, "staged"), { recursive: true, mode: 0o700 });
  await onPhase(workspaceCommitPhases.stagingCreated);
  let manifest: TransactionManifest | null = null;
  let bodyApplyStarted = false;
  try {
    const currentHead = await readHeadRevision(rootDir);
    if (currentHead !== baseRevision) {
      throw new WorkspaceRevisionConflictError(currentHead);
    }
    const capturedCurrentState = await captureLocalManagedWorkingTreeState(rootDir);
    if (!equalLocalManagedWorkingTreeState(capturedCurrentState, expectedCurrentState)) {
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
    await writeFileDurably(path.join(transactionDir, "manifest.json"), jsonSource(manifest));
    await fsyncDirectory(path.join(transactionDir, "backup"));
    await fsyncDirectory(path.join(transactionDir, "staged"));
    await fsyncDirectory(transactionDir);
    await fsyncDirectory(transactionsDir);
    await onPhase(workspaceCommitPhases.filesDurable);
    const stateBeforeApply = await captureLocalManagedWorkingTreeState(rootDir);
    if (!equalLocalManagedWorkingTreeState(stateBeforeApply, capturedCurrentState)) {
      throw new RepositoryAdapterError(
        "repository_busy",
        "Local repository changed while its transaction was being prepared",
      );
    }
    bodyApplyStarted = true;
    for (const directory of manifest.targetDirectories) {
      await ensureDirectory(rootDir, directory);
    }
    await applyTransactionBody(transactionDir, rootDir, manifest);
    await removeObsoleteDirectories(
      rootDir,
      manifest.backupDirectories,
      new Set(manifest.targetDirectories),
    );
    await assertWorkingTreeBodyMatchesTarget(
      rootDir,
      targetFiles,
      manifest.targetDirectories,
    );
    await onPhase(workspaceCommitPhases.workingTreeApplied);
    await applyTransactionHead(transactionDir, rootDir, manifest);
    // repository.json is the sole commit point and is always applied last.
    await Promise.resolve()
      .then(() => onPhase(workspaceCommitPhases.headCommitted))
      .catch(() => undefined);
    const cleaned = await rm(transactionDir, { force: true, recursive: true })
      .then(() => true, () => false);
    if (cleaned) {
      await fsyncDirectory(transactionsDir).catch(() => undefined);
      await Promise.resolve()
        .then(() => onPhase(workspaceCommitPhases.cleanupCompleted))
        .catch(() => undefined);
    }
  } catch (error) {
    if (manifest && !bodyApplyStarted) {
      await rm(transactionDir, { force: true, recursive: true }).catch(() => undefined);
      await fsyncDirectory(transactionsDir).catch(() => undefined);
    } else if (manifest) {
      const headRevision = await readHeadRevision(rootDir).catch(() => null);
      if (headRevision === baseRevision) {
        try {
          await applyTransaction(transactionDir, rootDir, manifest, "backup");
          await rm(transactionDir, { force: true, recursive: true });
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
      await rm(transactionDir, { force: true, recursive: true }).catch(() => undefined);
    }
    throw error;
  }
}

export function targetDirectoriesFromFilesAndIndex(
  targetFiles: LocalManagedFileSet,
  folderPaths: readonly string[],
) {
  const directories = new Set<string>(folderPaths);
  for (const relativePath of targetFiles.keys()) {
    if (relativePath.startsWith(`${localControlDirectoryName}/`)) continue;
    parentDirectories(relativePath).forEach((directory) => directories.add(directory));
  }
  return [...directories].sort((left, right) => left.localeCompare(right));
}
