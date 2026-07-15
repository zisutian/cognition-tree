import type {
  WorkspaceRepository,
  WorkspaceRepositorySnapshot,
} from "../../../storage/repository/workspaceRepository";
import type { WorkspaceData } from "../../../workspace/model/workspaceData";
import {
  resolveWorkspaceSyntax,
  type WorkspaceSyntax,
} from "../../../workspace/context/workspaceSyntax";
import { validateWorkspaceBlockMetadata } from "../../../workspace/context/workspaceBlockMetadata";

export type WorkspaceSessionSnapshot = {
  availability: WorkspaceRepositorySnapshot["availability"];
  currentRevision: string | null;
  repositoryPath: string;
  revision: string;
  syntaxSourceFile: WorkspaceRepositorySnapshot["syntaxSourceFile"];
  workspaceData: WorkspaceData;
  workspaceSyntax: WorkspaceSyntax | null;
};

export async function loadWorkspaceSessionSnapshot(
  repository: WorkspaceRepository,
): Promise<WorkspaceSessionSnapshot> {
  const repositorySnapshot = await repository.loadSnapshot();
  const workspaceSyntax = resolveWorkspaceSyntax(
    repositorySnapshot.syntaxSourceFile?.source ?? null,
  );

  if (workspaceSyntax) {
    validateWorkspaceBlockMetadata(
      repositorySnapshot.workspace,
      workspaceSyntax.profile,
    );
  }

  return {
    availability: repositorySnapshot.availability,
    currentRevision: repositorySnapshot.availability === "conflict"
      ? repositorySnapshot.currentRevision
      : null,
    repositoryPath: repositorySnapshot.repositoryPath,
    revision: repositorySnapshot.revision,
    syntaxSourceFile: repositorySnapshot.syntaxSourceFile,
    workspaceData: repositorySnapshot.workspace,
    workspaceSyntax,
  };
}
