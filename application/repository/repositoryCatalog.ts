// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  RepositoryAdapterKind,
  RepositoryAuthentication,
  RepositoryDeletionMode,
  WorkspaceRepositoryCatalogIssue,
  WorkspaceRepositoryDescriptor,
} from "./workspaceRepositoryCatalog";

export type CreateRepositoryRequest =
  | {
      adapter: "local";
      name: string;
    }
  | {
      adapter: "webdav";
      authentication: RepositoryAuthentication;
      name: string;
      url: string;
    };

export type DeleteRepositoryRequest = {
  id: string;
  mode: RepositoryDeletionMode;
};

export type RenameRepositoryRequest = {
  id: string;
  name: string;
};

export type RepositoryCatalogOperation =
  | "creating"
  | "deleting"
  | "idle"
  | "renaming"
  | "switching";

export type ReadyRepositoryCatalogState = {
  activeRepositoryId: string | null;
  creatableAdapters: RepositoryAdapterKind[];
  issues: WorkspaceRepositoryCatalogIssue[];
  operation: RepositoryCatalogOperation;
  repositories: WorkspaceRepositoryDescriptor[];
  status: "ready";
};

export type RepositoryCatalogState =
  | { status: "loading" }
  | { errorMessage: string; status: "failed" }
  | ReadyRepositoryCatalogState;

function repositoryLocationsEqual(
  left: WorkspaceRepositoryDescriptor["location"],
  right: WorkspaceRepositoryDescriptor["location"],
) {
  if (left.type !== right.type) return false;

  switch (left.type) {
    case "local":
      return right.type === "local" &&
        left.hostPath === right.hostPath &&
        left.serverPath === right.serverPath;
    case "webdav":
      return right.type === "webdav" && left.url === right.url;
  }
}

export function reuseUnchangedRepositoryDescriptors(
  previous: WorkspaceRepositoryDescriptor[],
  next: WorkspaceRepositoryDescriptor[],
) {
  const previousById = new Map(
    previous.map((descriptor) => [descriptor.id, descriptor]),
  );

  return next.map((descriptor) => {
    const existing = previousById.get(descriptor.id);

    return existing &&
        existing.adapter === descriptor.adapter &&
        existing.label === descriptor.label &&
        existing.labelIssue === descriptor.labelIssue &&
        repositoryLocationsEqual(existing.location, descriptor.location)
      ? existing
      : descriptor;
  });
}

export function selectRepositoryAfterDeletion(
  previousRepositories: WorkspaceRepositoryDescriptor[],
  nextRepositories: WorkspaceRepositoryDescriptor[],
  deletedId: string,
) {
  const nextIds = new Set(nextRepositories.map(({ id }) => id));
  const deletedIndex = previousRepositories.findIndex(
    ({ id }) => id === deletedId,
  );

  if (deletedIndex >= 0) {
    for (
      let index = deletedIndex + 1;
      index < previousRepositories.length;
      index += 1
    ) {
      const id = previousRepositories[index]?.id;

      if (id && nextIds.has(id)) return id;
    }
    for (let index = deletedIndex - 1; index >= 0; index -= 1) {
      const id = previousRepositories[index]?.id;

      if (id && nextIds.has(id)) return id;
    }
  }

  return nextRepositories[0]?.id ?? null;
}
