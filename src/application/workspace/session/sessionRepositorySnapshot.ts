import type {
  WorkspaceRepository,
  WorkspaceRepositorySnapshot,
} from "../../../storage/workspaceRepository";
import type { WorkspaceData } from "../../../workspace/model/workspaceData";
import {
  resolveWorkspaceSyntax,
  type WorkspaceSyntax,
} from "../../../workspace/context/workspaceSyntax";

export type WorkspaceSessionSnapshot = {
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

  return {
    repositoryPath: repositorySnapshot.repositoryPath,
    revision: repositorySnapshot.revision,
    syntaxSourceFile: repositorySnapshot.syntaxSourceFile,
    workspaceData: repositorySnapshot.workspace,
    workspaceSyntax: resolveWorkspaceSyntax(
      repositorySnapshot.syntaxSourceFile?.source ?? null,
    ),
  };
}
