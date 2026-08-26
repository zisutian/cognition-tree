// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID, createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  opendir,
  readFile,
  realpath,
  rm,
  stat,
  utimes,
} from "node:fs/promises";
import path from "node:path";
import {
  SystemMigrationConflictError,
  SystemMigrationNotFoundError,
  SystemMigrationValidationError,
} from "../../../application/system/systemConfiguration.ts";
import type {
  DataRootMigrationStatus,
  SystemMaintenancePort,
} from "../../../application/system/systemConfiguration.ts";
import type { BootstrapConfigurationStore } from "./bootstrapConfigurationStore.ts";
import type { DataRootMigrationCoordinator } from "./systemAdministrationService.ts";

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

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function overlaps(left: string, right: string) {
  const relative = path.relative(left, right);
  const reverse = path.relative(right, left);

  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)) ||
    (!reverse.startsWith("..") && !path.isAbsolute(reverse));
}

async function assertDestination(destination: string, source: string, control: string) {
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

  if (sourceStats.isSymbolicLink()) throw new Error(`Symbolic link is not allowed: ${source}`);
  if (sourceStats.isDirectory()) {
    await mkdir(destination, { mode: sourceStats.mode & 0o777 });
    try {
      const directory = await opendir(source);

      for await (const entry of directory) {
        await copyTree(path.join(source, entry.name), path.join(destination, entry.name));
      }
      await chmod(destination, sourceStats.mode & 0o777);
      await utimes(destination, sourceStats.atime, sourceStats.mtime);
    } finally {
      await utimes(source, sourceStats.atime, sourceStats.mtime);
    }
    return;
  }
  if (!sourceStats.isFile()) throw new Error(`Unsupported data-root entry: ${source}`);
  try {
    await copyFile(source, destination);
    await chmod(destination, sourceStats.mode & 0o777);
    await utimes(destination, sourceStats.atime, sourceStats.mtime);
  } finally {
    await utimes(source, sourceStats.atime, sourceStats.mtime);
  }
}

async function fingerprints(root: string, relative = ""): Promise<FileFingerprint[]> {
  const current = path.join(root, relative);
  const stats = await lstat(current);

  if (stats.isSymbolicLink()) throw new Error(`Symbolic link is not allowed: ${current}`);
  if (stats.isFile()) {
    try {
      return [{
        digest: createHash("sha256").update(await readFile(current)).digest("hex"),
        path: relative,
        size: stats.size,
      }];
    } finally {
      await utimes(current, stats.atime, stats.mtime);
    }
  }
  if (!stats.isDirectory()) throw new Error(`Unsupported data-root entry: ${current}`);
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

async function copyAuthoritativePartitions(source: string, destination: string) {
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

async function verifyAuthoritativePartitions(source: string, destination: string) {
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

export class FileDataRootMigrationCoordinator implements DataRootMigrationCoordinator {
  readonly #agentProviderOperations: { hasPendingCodexLogin(): boolean };
  readonly #agentService: { hasResidentSessions(): boolean };
  readonly #bootstrap: BootstrapConfigurationStore;
  readonly #controlRoot: string;
  readonly #maintenance: SystemMaintenancePort;
  readonly #requestRestart: () => Promise<void>;
  readonly #restartDelayMilliseconds: number;
  readonly #statuses = new Map<string, DataRootMigrationStatus>();
  #activeId: string | null = null;

  constructor({
    agentProviderOperations = { hasPendingCodexLogin: () => false },
    agentService,
    bootstrap,
    controlRoot,
    maintenance,
    requestRestart,
    restartDelayMilliseconds = 500,
  }: {
    agentProviderOperations?: { hasPendingCodexLogin(): boolean };
    agentService: { hasResidentSessions(): boolean };
    bootstrap: BootstrapConfigurationStore;
    controlRoot: string;
    maintenance: SystemMaintenancePort;
    requestRestart(): Promise<void>;
    restartDelayMilliseconds?: number;
  }) {
    this.#agentProviderOperations = agentProviderOperations;
    this.#agentService = agentService;
    this.#bootstrap = bootstrap;
    this.#controlRoot = path.resolve(controlRoot);
    this.#maintenance = maintenance;
    this.#requestRestart = requestRestart;
    this.#restartDelayMilliseconds = restartDelayMilliseconds;
  }

  async get(migrationId: string) {
    const status = this.#statuses.get(migrationId);

    if (!status) throw new SystemMigrationNotFoundError();
    return status;
  }

  async start(baseRevision: string, destination: string) {
    if (this.#activeId) {
      throw new SystemMigrationConflictError("A data-root migration is already active");
    }
    if (this.#agentService.hasResidentSessions() ||
        this.#agentProviderOperations.hasPendingCodexLogin()) {
      throw new SystemMigrationConflictError(
        "Agent sessions and Codex logins must finish before migrating data",
      );
    }
    const snapshot = await this.#bootstrap.readSnapshot();

    if (snapshot.revision !== baseRevision) {
      throw new SystemMigrationConflictError(
        "System configuration revision changed",
        snapshot.revision,
      );
    }
    const source = path.resolve(snapshot.configuration.dataRoot);
    const target = await assertDestination(destination, source, this.#controlRoot);
    const id = randomUUID();
    const status: DataRootMigrationStatus = {
      destination: target,
      errorMessage: null,
      id,
      source,
      status: "copying",
    };

    this.#activeId = id;
    this.#statuses.set(id, status);
    setTimeout(() => void this.#execute(id, baseRevision), 0);
    return status;
  }

  async #execute(id: string, baseRevision: string) {
    const initial = this.#statuses.get(id);

    if (!initial) return;
    let lease;
    let pointerSwitched = false;

    try {
      lease = await this.#maintenance.begin();
      await copyAuthoritativePartitions(initial.source, initial.destination);
      this.#statuses.set(id, { ...initial, status: "verifying" });
      await verifyAuthoritativePartitions(initial.source, initial.destination);
      await this.#bootstrap.setDataRoot(baseRevision, initial.destination);
      pointerSwitched = true;
      this.#statuses.set(id, { ...initial, status: "restarting" });
      await new Promise((resolve) =>
        setTimeout(resolve, this.#restartDelayMilliseconds)
      );
      try {
        await this.#requestRestart();
      } catch (error) {
        this.#statuses.set(id, {
          ...initial,
          errorMessage: error instanceof Error
            ? `Automatic restart failed: ${error.message}`
            : "Automatic restart failed",
          status: "restarting",
        });
      }
    } catch (error) {
      if (pointerSwitched) return;
      await rm(initial.destination, { force: true, recursive: true });
      this.#statuses.set(id, {
        ...initial,
        errorMessage: error instanceof Error ? error.message : "Data-root migration failed",
        status: "failed",
      });
      lease?.finish();
      this.#activeId = null;
    }
  }
}
