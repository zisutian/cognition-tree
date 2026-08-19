// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  RepositoryApiErrorCodeDto,
  RepositoryRevisionDto,
  WorkspaceRepositoryCommitDto,
  WorkspaceRepositoryContentDto,
} from "../../../contracts/workspace/types.ts";
import type {
  PreparedVersionedContent,
} from "../../../application/persistence/versionedRepository.ts";
import type {
  WorkspaceRepositoryPreparation,
} from "../../../application/workspace/persistence/workspaceRepositoryPreparation.ts";

export type PreparedWorkspaceRepositorySnapshot = PreparedVersionedContent<
  WorkspaceRepositoryContentDto,
  WorkspaceRepositoryPreparation
> & { revision: RepositoryRevisionDto };

export type WorkspaceRepositoryCommitReceipt = {
  after: PreparedWorkspaceRepositorySnapshot;
  before: PreparedWorkspaceRepositorySnapshot;
  revision: RepositoryRevisionDto;
};

export type WorkspaceRepositoryStore = {
  commitPreparedSnapshot(
    commit: WorkspaceRepositoryCommitDto,
    projection: WorkspaceRepositoryPreparation,
  ): Promise<WorkspaceRepositoryCommitReceipt>;
  commitSnapshot(
    commit: WorkspaceRepositoryCommitDto,
  ): Promise<WorkspaceRepositoryCommitReceipt>;
  loadSnapshot(): Promise<PreparedWorkspaceRepositorySnapshot>;
};

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

export class WorkspaceRevisionConflictError extends Error {
  currentRevision: RepositoryRevisionDto;

  constructor(currentRevision: RepositoryRevisionDto) {
    super("Repository content changed outside the current session");
    this.name = "WorkspaceRevisionConflictError";
    this.currentRevision = currentRevision;
  }
}
