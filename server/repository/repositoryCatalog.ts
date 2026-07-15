// SPDX-License-Identifier: GPL-3.0-or-later

import type { parseCreateRepository } from "../../contracts/workspace-repository/parseCatalog.ts";
import type {
  RepositoryCatalogDto,
  RepositoryDescriptorDto,
} from "../../contracts/workspace-repository/types.ts";
import type { WorkspaceRepositoryStore } from "./repositoryStore.ts";

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
