import type { WorkspaceRepository } from "../../../storage/workspaceRepository";
import type { WorkspaceData } from "../../../workspace/model/workspaceData";
import {
  resolveWorkspaceSyntaxFile,
  type WorkspaceSyntaxSourceFile,
  type WorkspaceSyntaxFile,
} from "../../../workspace/context/workspaceSyntaxFile";

export type WorkspaceSessionSnapshot = {
  repositoryPath: string;
  revision: string;
  syntaxSourceFile: WorkspaceSyntaxSourceFile | null;
  workspaceData: WorkspaceData;
  workspaceSyntaxFile: WorkspaceSyntaxFile | null;
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
    workspaceSyntaxFile: resolveWorkspaceSyntaxFile(
      repositorySnapshot.syntaxSourceFile,
    ),
  };
}
