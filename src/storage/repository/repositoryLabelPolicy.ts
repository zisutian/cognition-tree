// SPDX-License-Identifier: GPL-3.0-or-later

import {
  normalizeRepositoryLabel,
  parseRenameRepository,
} from "../../../contracts/workspace-repository/parseCatalog";
import type {
  RepositoryCatalogDto,
  RepositoryDescriptorDto,
} from "../../../contracts/workspace-repository/types";

const reservedLabelKeys = new Set([
  normalizeRepositoryLabel("日记"),
  normalizeRepositoryLabel("代办"),
]);

export function parseAvailableWorkspaceRepositoryLabel(
  label: string,
  repositories: readonly RepositoryDescriptorDto[],
  excludedRepositoryId: string | null = null,
) {
  const parsed = parseRenameRepository({ label }).label;
  const key = normalizeRepositoryLabel(parsed);

  if (reservedLabelKeys.has(key)) {
    throw new Error(`Repository name is reserved: ${parsed}`);
  }
  if (
    repositories.some((repository) =>
      repository.id !== excludedRepositoryId &&
      normalizeRepositoryLabel(repository.label) === key
    )
  ) {
    throw new Error(`Repository name already exists: ${parsed}`);
  }
  return parsed;
}

export function projectWorkspaceRepositoryNameConflicts(
  catalog: RepositoryCatalogDto,
): RepositoryCatalogDto {
  const counts = new Map<string, number>();

  for (const repository of catalog.repositories) {
    const key = normalizeRepositoryLabel(repository.label);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return {
    ...catalog,
    repositories: catalog.repositories.map((repository) => {
      const key = normalizeRepositoryLabel(repository.label);

      return {
        ...repository,
        nameConflict:
          reservedLabelKeys.has(key) || (counts.get(key) ?? 0) > 1,
      };
    }),
  };
}
