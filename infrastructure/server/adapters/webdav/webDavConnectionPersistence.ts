// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import { lstat, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { isRepositoryId } from "../../../../contracts/workspace/parseCatalog.ts";
import type { RepositoryCatalogIssueDto } from "../../../../contracts/workspace/types.ts";
import { hasFileSystemErrorCode } from "../../persistence/fileSystemError.ts";
import {
  fsyncDirectory,
  replaceFileDurably,
} from "../../persistence/fileSystemPersistence.ts";
import { RepositoryCatalogError } from "../../repository/repositoryCatalog.ts";
import {
  parseWebDavConnectionConfig,
  serializeWebDavConnectionConfig,
  type WebDavConnectionConfig,
} from "./webDavConnectionConfig.ts";

const temporaryFilePattern = /\.json\.\d+\.[0-9a-f-]+\.tmp$/i;
const deletionFilePattern = /^\.delete-.+-[0-9a-f-]+$/i;

export const webDavRegistryConfigRemovalPhases = {
  beforeRename: "before-rename",
  cleanupCompleted: "cleanup-completed",
  renamed: "renamed",
} as const;

export type WebDavRegistryConfigRemovalPhase =
  typeof webDavRegistryConfigRemovalPhases[
    keyof typeof webDavRegistryConfigRemovalPhases
  ];

export function webDavConnectionPath(
  connectionsDirectory: string,
  repositoryId: string,
) {
  if (!isRepositoryId(repositoryId)) {
    throw new RepositoryCatalogError(
      "invalid_request",
      `Invalid repository id: ${repositoryId}`,
    );
  }
  return path.join(connectionsDirectory, `${repositoryId}.json`);
}

export async function webDavConnectionConfigExists(
  connectionsDirectory: string,
  repositoryId: string,
) {
  try {
    await lstat(webDavConnectionPath(connectionsDirectory, repositoryId));
    return true;
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ENOENT")) return false;
    throw error;
  }
}

export function writeWebDavConnectionConfig(
  connectionsDirectory: string,
  config: WebDavConnectionConfig,
) {
  return replaceFileDurably(
    webDavConnectionPath(connectionsDirectory, config.id),
    serializeWebDavConnectionConfig(config),
  );
}

export async function cleanInterruptedWebDavConnectionFiles(
  connectionsDirectory: string,
) {
  const entries = await readdir(connectionsDirectory, { withFileTypes: true });
  let changed = false;

  for (const entry of entries) {
    if (
      (entry.isFile() || entry.isSymbolicLink()) &&
      (temporaryFilePattern.test(entry.name) ||
        deletionFilePattern.test(entry.name))
    ) {
      await rm(path.join(connectionsDirectory, entry.name), { force: true });
      changed = true;
    }
  }
  if (changed) await fsyncDirectory(connectionsDirectory);
}

export async function loadWebDavConnectionConfigs(
  connectionsDirectory: string,
) {
  const configs = new Map<string, WebDavConnectionConfig>();
  const issues = new Map<string, RepositoryCatalogIssueDto>();
  const entries = await readdir(connectionsDirectory, { withFileTypes: true });
  const configEntries = entries
    .filter((entry) => entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name));
  const urls = new Set<string>();

  for (const entry of configEntries) {
    const repositoryId = entry.name.slice(0, -".json".length);

    if (!isRepositoryId(repositoryId)) {
      throw new Error("WebDAV registry contains an invalid connection file name");
    }
    try {
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error("WebDAV connection is not a regular file");
      }
      const filePath = webDavConnectionPath(
        connectionsDirectory,
        repositoryId,
      );
      const stats = await lstat(filePath);

      if ((stats.mode & 0o077) !== 0) {
        throw new Error("WebDAV connection permissions are too broad");
      }
      const config = parseWebDavConnectionConfig(
        await readFile(filePath, "utf8"),
        repositoryId,
      );

      if (urls.has(config.url)) throw new Error("Duplicate WebDAV target");
      urls.add(config.url);
      configs.set(repositoryId, config);
    } catch {
      issues.set(repositoryId, {
        adapter: "webdav",
        code: "repository_corrupt",
        id: repositoryId,
        location: null,
        message: "WebDAV connection configuration is invalid",
        status: "fault",
      });
    }
  }

  return { configs, issues };
}

export async function removeWebDavConnectionConfig({
  connectionsDirectory,
  onPhase,
  repositoryId,
}: {
  connectionsDirectory: string;
  onPhase(phase: WebDavRegistryConfigRemovalPhase): Promise<void> | void;
  repositoryId: string;
}) {
  const filePath = webDavConnectionPath(connectionsDirectory, repositoryId);
  const deletionPath = path.join(
    connectionsDirectory,
    `.delete-${repositoryId}-${randomUUID()}`,
  );

  try {
    await onPhase(webDavRegistryConfigRemovalPhases.beforeRename);
    await rename(filePath, deletionPath);
  } catch (error) {
    if (hasFileSystemErrorCode(error, "ENOENT")) return false;
    throw error;
  }
  await Promise.resolve()
    .then(() => onPhase(webDavRegistryConfigRemovalPhases.renamed))
    .catch(() => undefined);
  await fsyncDirectory(connectionsDirectory).catch(() => undefined);
  await rm(deletionPath, { force: true }).catch(() => undefined);
  await fsyncDirectory(connectionsDirectory).catch(() => undefined);
  await Promise.resolve()
    .then(() => onPhase(webDavRegistryConfigRemovalPhases.cleanupCompleted))
    .catch(() => undefined);
  return true;
}
