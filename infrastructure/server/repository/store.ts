// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  RepositoryApiErrorCodeDto,
  RepositoryRevisionDto,
  WorkspaceRepositoryContentDto,
} from "../../../contracts/workspace/types.ts";
import type {
  PreparedVersionedCommit,
  PreparedVersionedCommitReceipt,
  PreparedVersionedSnapshot,
  PreparedVersionedStore,
} from "../../../application/persistence/versionedRepository.ts";
import type {
  WorkspaceRepositoryPreparation,
} from "../../../application/workspace/persistence/workspaceRepositoryPreparation.ts";

export type PreparedWorkspaceRepositorySnapshot = PreparedVersionedSnapshot<
  WorkspaceRepositoryContentDto,
  WorkspaceRepositoryPreparation,
  RepositoryRevisionDto
>;

export type PreparedWorkspaceRepositoryCommit = PreparedVersionedCommit<
  WorkspaceRepositoryContentDto,
  WorkspaceRepositoryPreparation,
  RepositoryRevisionDto
>;

export type WorkspaceRepositoryCommitReceipt = PreparedVersionedCommitReceipt<
  WorkspaceRepositoryContentDto,
  WorkspaceRepositoryPreparation,
  RepositoryRevisionDto
>;

export type WorkspaceRepositoryStore = PreparedVersionedStore<
  WorkspaceRepositoryContentDto,
  WorkspaceRepositoryPreparation,
  RepositoryRevisionDto
>;

const statusByCode: Record<RepositoryApiErrorCodeDto, number> = {
  adapter_unavailable: 503,
  insufficient_storage: 507,
  internal_error: 500,
  invalid_request: 400,
  repository_busy: 423,
  repository_corrupt: 500,
  repository_not_found: 404,
  revision_conflict: 409,
  unauthorized: 401,
  unsupported_repository_version: 409,
};

export class RepositoryAdapterError extends Error {
  code: RepositoryApiErrorCodeDto;
  statusCode: number;

  constructor(code: RepositoryApiErrorCodeDto, message: string) {
    super(message);
    this.name = "RepositoryAdapterError";
    this.code = code;
    this.statusCode = statusByCode[code];
  }
}

export class RepositoryCorruptError extends RepositoryAdapterError {
  constructor(message = "Repository data is corrupt") {
    super("repository_corrupt", message);
    this.name = "RepositoryCorruptError";
  }
}
