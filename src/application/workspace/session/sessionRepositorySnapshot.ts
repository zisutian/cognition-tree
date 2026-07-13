import type { WorkspaceRepository } from "../../../storage/workspaceRepository";
import {
  createInitialWorkspaceData,
  type WorkspaceData,
} from "../../../workspace/model/workspaceData";
import {
  resolveWorkspaceSyntaxFile,
  type WorkspaceSyntaxFile,
} from "../../../workspace/context/workspaceSyntaxFile";

export type WorkspaceSessionSnapshot = {
  repositoryPath: string;
  workspaceData: WorkspaceData;
  workspaceSyntaxFile: WorkspaceSyntaxFile | null;
};

function resolveWorkspaceData(workspace: WorkspaceData | null) {
  return workspace ?? createInitialWorkspaceData();
}

export async function loadWorkspaceSessionSnapshot(
  repository: WorkspaceRepository,
): Promise<WorkspaceSessionSnapshot> {
  const [storedWorkspace, repositoryInfo, storedWorkspaceSyntaxSource] =
    await Promise.all([
      repository.loadWorkspace(),
      repository.getRepositoryInfo(),
      repository.readWorkspaceSyntaxSourceFile(),
    ]);

  return {
    repositoryPath: repositoryInfo.path,
    workspaceData: resolveWorkspaceData(storedWorkspace),
    workspaceSyntaxFile: resolveWorkspaceSyntaxFile(storedWorkspaceSyntaxSource),
  };
}
