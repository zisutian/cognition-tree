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
  const [repositorySnapshot, repositoryInfo] =
    await Promise.all([
      repository.loadSnapshot(),
      repository.getRepositoryInfo(),
    ]);

  return {
    repositoryPath: repositoryInfo.path,
    revision: repositorySnapshot.revision,
    syntaxSourceFile: repositorySnapshot.syntaxSourceFile,
    workspaceData: repositorySnapshot.workspace,
    workspaceSyntaxFile: resolveWorkspaceSyntaxFile(
      repositorySnapshot.syntaxSourceFile,
    ),
  };
}
