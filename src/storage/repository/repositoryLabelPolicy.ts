// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseRenameRepository,
} from "../../../contracts/workspace-repository/parseCatalog";
import type {
  RepositoryCatalogDto,
  RepositoryDescriptorDto,
} from "../../../contracts/workspace-repository/types";
import {
  createPortableNameKey,
  getPortableNameIssue,
} from "../../../portable-name/portableName";

const reservedLabelKeys = new Set([
  createPortableNameKey("日记"),
  createPortableNameKey("代办"),
]);

export function parseAvailableWorkspaceRepositoryLabel(
  label: string,
  repositories: readonly RepositoryDescriptorDto[],
  excludedRepositoryId: string | null = null,
) {
  const parsed = parseRenameRepository({ label }).label;
  const key = createPortableNameKey(parsed);

  if (reservedLabelKeys.has(key)) {
    throw new Error(`Repository name is reserved: ${parsed}`);
  }
  if (
    repositories.some((repository) =>
      repository.id !== excludedRepositoryId &&
      createPortableNameKey(repository.label) === key
    )
  ) {
    throw new Error(`Repository name already exists: ${parsed}`);
  }
  return parsed;
}

export function projectWorkspaceRepositoryLabelIssues(
  catalog: RepositoryCatalogDto,
): RepositoryCatalogDto {
  const counts = new Map<string, number>();

  for (const repository of catalog.repositories) {
    const key = createPortableNameKey(repository.label);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return {
    ...catalog,
    repositories: catalog.repositories.map((repository) => {
      const key = createPortableNameKey(repository.label);
      const portableIssue = getPortableNameIssue(repository.label);

      return {
        ...repository,
        labelIssue: portableIssue
          ? "nonportable"
          : reservedLabelKeys.has(key)
            ? "reserved"
            : (counts.get(key) ?? 0) > 1
              ? "conflict"
              : null,
      };
    }),
  };
}
