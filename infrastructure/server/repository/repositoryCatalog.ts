// SPDX-License-Identifier: GPL-3.0-or-later

import type { parseCreateRepository } from "../../../contracts/workspace/parseCatalog.ts";
import type { parseRenameRepository } from "../../../contracts/workspace/parseCatalog.ts";
import type {
  RepositoryApiErrorCodeDto,
  RepositoryCatalogDto,
  RepositoryDeletionModeDto,
  RepositoryDeletionResultDto,
  RepositoryDescriptorDto,
} from "../../../contracts/workspace/types.ts";
import type { WorkspaceRepositoryStore } from "./repositoryStore.ts";

export type WorkspaceRepositoryCatalog = {
  createRepository: (
    value: ReturnType<typeof parseCreateRepository>,
  ) => Promise<RepositoryDescriptorDto>;
  deleteRepository: (
    repositoryId: string,
    mode: RepositoryDeletionModeDto,
  ) => Promise<RepositoryDeletionResultDto>;
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
