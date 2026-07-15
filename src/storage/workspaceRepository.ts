import type { WorkspaceData } from "../workspace/model/workspaceData";
import {
  repositorySyntaxFileName,
  type RepositorySyntaxSourceDto,
} from "../../contracts/workspace-repository/types";

export type WorkspaceRepositoryContent = {
  syntaxSourceFile: RepositorySyntaxSourceDto | null;
  workspace: WorkspaceData;
};

export function createWorkspaceRepositorySyntaxSourceFile(
  source: string,
): RepositorySyntaxSourceDto {
  return {
    fileName: repositorySyntaxFileName,
    source,
  };
}

type WorkspaceRepositorySnapshotBase = WorkspaceRepositoryContent & {
  repositoryPath: string;
  revision: string;
};

export type WorkspaceRepositorySnapshot = WorkspaceRepositorySnapshotBase &
  (
    | { availability: "offline" | "online" }
    | { availability: "conflict"; currentRevision: string }
  );

export type WorkspaceRepositoryCommit = WorkspaceRepositoryContent & {
  baseRevision: string;
};

export type WorkspaceRepositoryCommitResult = {
  availability: "offline" | "online";
  revision: string;
};

export class WorkspaceRepositoryConflictError extends Error {
  currentRevision: string;

  constructor(currentRevision: string) {
    super("Repository content changed outside the current session");
    this.name = "WorkspaceRepositoryConflictError";
    this.currentRevision = currentRevision;
  }
}

export type WorkspaceRepository = {
  label: string;
  commitSnapshot: (
    commit: WorkspaceRepositoryCommit,
  ) => Promise<WorkspaceRepositoryCommitResult>;
  discardPendingCommit: () => Promise<void>;
  loadSnapshot: () => Promise<WorkspaceRepositorySnapshot>;
};

export class WorkspaceRepositoryUnavailableError extends Error {
  constructor(message = "Repository is unavailable") {
    super(message);
    this.name = "WorkspaceRepositoryUnavailableError";
  }
}
