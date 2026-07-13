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

export type WorkspaceRepositorySnapshot = WorkspaceRepositoryContent & {
  repositoryPath: string;
  revision: string;
};

export type WorkspaceRepositoryCommit = WorkspaceRepositoryContent & {
  baseRevision: string;
};

export type WorkspaceRepositoryCommitResult = {
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
  loadSnapshot: () => Promise<WorkspaceRepositorySnapshot>;
};
