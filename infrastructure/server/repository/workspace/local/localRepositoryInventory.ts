// SPDX-License-Identifier: GPL-3.0-or-later

import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import {
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "../../../../../contracts/workspace/contractValue.ts";
import { isRepositoryId } from "../../../../../contracts/workspace/parseCatalog.ts";
import type {
  RepositoryCatalogDto,
  RepositoryCatalogIssueDto,
  RepositoryDescriptorDto,
} from "../../../../../contracts/workspace/types.ts";
import {
  createPortableNameKey,
  getPortableNameIssue,
} from "../../../../../core/naming/portableName.ts";
import { RepositoryCorruptError } from "../../store.ts";
import { hasFileSystemErrorCode } from "../../../persistence/fileSystemError.ts";
import { readLocalJson } from "./localWorkingTree.ts";
import { parseLocalRepositoryMetadata } from "./localWorkingTreeCodec.ts";
import {
  localControlDirectoryName,
  localRepositoryMetadataFileName,
} from "./localWorkingTreeLayout.ts";

function classifyLocalRepositoryCatalogIssue(
  error: unknown,
): RepositoryCatalogIssueDto["code"] {
  if (error instanceof UnsupportedRepositoryVersionError) {
    return "unsupported_repository_version";
  }
  if (hasFileSystemErrorCode(error, "ENOENT")) {
    return "repository_corrupt";
  }
  if (
    error instanceof RepositoryCorruptError || error instanceof SyntaxError ||
    error instanceof WorkspaceRepositoryContractError
  ) {
    return "repository_corrupt";
  }
  return "adapter_unavailable";
}

export async function readLocalRepositoryCatalog({
  createDescriptor,
  createLocation,
  isReservedLabel,
  resolveRepositoryPath,
  rootDir,
}: {
  createDescriptor(
    repositoryId: string,
    label: string,
  ): RepositoryDescriptorDto;
  createLocation(repositoryId: string): RepositoryDescriptorDto["location"];
  isReservedLabel(label: string): boolean;
  resolveRepositoryPath(repositoryId: string): string;
  rootDir: string;
}): Promise<RepositoryCatalogDto> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const repositoryIds = entries
    .filter((entry) =>
      entry.isDirectory() &&
      !entry.isSymbolicLink() &&
      isRepositoryId(entry.name)
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const repositories: RepositoryDescriptorDto[] = [];
  const issues: RepositoryCatalogIssueDto[] = [];

  for (const repositoryId of repositoryIds) {
    try {
      const repositoryPath = resolveRepositoryPath(repositoryId);
      const repositoryStats = await lstat(repositoryPath);
      if (!repositoryStats.isDirectory() || repositoryStats.isSymbolicLink()) {
        throw new WorkspaceRepositoryContractError(
          "$.layoutVersion",
          "Local repository root is invalid",
        );
      }
      const controlPath = path.join(repositoryPath, localControlDirectoryName);
      const controlStats = await lstat(controlPath);
      if (!controlStats.isDirectory() || controlStats.isSymbolicLink()) {
        throw new WorkspaceRepositoryContractError(
          "$.layoutVersion",
          "Local control directory is invalid",
        );
      }
      const metadata = parseLocalRepositoryMetadata(await readLocalJson(
        path.join(controlPath, localRepositoryMetadataFileName),
      ));

      if (metadata.repositoryId !== repositoryId) {
        throw new WorkspaceRepositoryContractError(
          "$.repositoryId",
          "repository identity does not match its directory",
        );
      }

      repositories.push(createDescriptor(repositoryId, metadata.label));
    } catch (error) {
      const code = classifyLocalRepositoryCatalogIssue(error);

      issues.push({
        code,
        id: repositoryId,
        location: createLocation(repositoryId),
        message: code === "unsupported_repository_version"
          ? "Repository version is not supported"
          : "Repository metadata is invalid",
      });
    }
  }

  const countsByLabel = new Map<string, number>();
  for (const repository of repositories) {
    const key = createPortableNameKey(repository.label);
    countsByLabel.set(key, (countsByLabel.get(key) ?? 0) + 1);
  }

  return {
    issues,
    repositories: repositories.map((repository) => {
      const key = createPortableNameKey(repository.label);
      const portableIssue = getPortableNameIssue(repository.label);

      return {
        ...repository,
        labelIssue: portableIssue
          ? "nonportable"
          : isReservedLabel(repository.label)
            ? "reserved"
            : (countsByLabel.get(key) ?? 0) > 1
              ? "conflict"
              : null,
      };
    }),
  };
}
