// SPDX-License-Identifier: GPL-3.0-or-later

import type { parseCreateRepository } from "../contracts/workspace-repository/parseCatalog.ts";
import type {
  RepositoryCatalogDto,
  RepositoryDescriptorDto,
  WorkspaceRepositoryCommitResultDto,
  WorkspaceRepositorySnapshotDto,
} from "../contracts/workspace-repository/types.ts";

export type WorkspaceRepositoryStore = {
  commitSnapshot: (
    value: unknown,
  ) => Promise<WorkspaceRepositoryCommitResultDto>;
  loadSnapshot: () => Promise<WorkspaceRepositorySnapshotDto>;
};

export type WorkspaceRepositoryCatalog = {
  createRepository: (
    value: ReturnType<typeof parseCreateRepository>,
  ) => Promise<RepositoryDescriptorDto>;
  getStore: (repositoryId: string) => Promise<WorkspaceRepositoryStore>;
  listRepositories: () => Promise<RepositoryCatalogDto>;
};

export type WorkspaceRepositoryRegistration = {
  descriptor: RepositoryDescriptorDto;
  store: WorkspaceRepositoryStore;
};

export class RepositoryCatalogError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "RepositoryCatalogError";
    this.statusCode = statusCode;
  }
}

export class RepositoryAdapterError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "RepositoryAdapterError";
    this.statusCode = statusCode;
  }
}

export class WorkspaceRevisionConflictError extends Error {
  currentRevision: string;

  constructor(currentRevision: string) {
    super("Repository content changed outside the current session");
    this.name = "WorkspaceRevisionConflictError";
    this.currentRevision = currentRevision;
  }
}
