// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  WorkspaceRepositoryCommitResultDto,
  WorkspaceRepositorySnapshotDto,
} from "../../contracts/workspace-repository/types.ts";

export type WorkspaceRepositoryStore = {
  commitSnapshot: (
    value: unknown,
  ) => Promise<WorkspaceRepositoryCommitResultDto>;
  loadSnapshot: () => Promise<WorkspaceRepositorySnapshotDto>;
};

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
