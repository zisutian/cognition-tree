// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  parseCreateRepository,
  parseRenameRepository,
  RepositoryApiErrorCodeDto,
  RepositoryCatalogDto,
  RepositoryDescriptorDto,
} from "../../../contracts/workspace/index.ts";


import type { WorkspaceRepositoryStore } from "./store.ts";

export type WorkspaceRepositoryCatalog = {
  createRepository: (
    value: ReturnType<typeof parseCreateRepository>,
  ) => Promise<RepositoryDescriptorDto>;
  deleteRepository: (repositoryId: string) => Promise<void>;
  getStore: (repositoryId: string) => Promise<WorkspaceRepositoryStore>;
  listRepositories: () => Promise<RepositoryCatalogDto>;
  renameRepository: (
    repositoryId: string,
    value: ReturnType<typeof parseRenameRepository>,
  ) => Promise<RepositoryDescriptorDto>;
};

export class RepositoryCatalogError extends Error {
  code: RepositoryApiErrorCodeDto;

  constructor(code: RepositoryApiErrorCodeDto, message: string) {
    super(message);
    this.name = "RepositoryCatalogError";
    this.code = code;
  }
}
