import type {
  WorkspaceRepository,
  WorkspaceRepositorySnapshot,
} from "../../../storage/repository/workspaceRepository";
import {
  resolveWorkspaceSyntax,
  type WorkspaceSyntax,
} from "../../../workspace/context/workspaceSyntax";
import { validateWorkspaceBlockMetadata } from "../../../workspace/context/workspaceBlockMetadata";

export type WorkspaceSessionSnapshot = WorkspaceRepositorySnapshot & {
  workspaceSyntax: WorkspaceSyntax | null;
};

export async function loadWorkspaceSessionSnapshot(
  repository: WorkspaceRepository,
): Promise<WorkspaceSessionSnapshot> {
  const repositorySnapshot = await repository.loadSnapshot();
  const workspaceSyntax = resolveWorkspaceSyntax(
    repositorySnapshot.content.syntaxSource,
  );

  validateWorkspaceBlockMetadata(
    repositorySnapshot.content.workspace,
    workspaceSyntax?.profile ?? null,
  );

  return { ...repositorySnapshot, workspaceSyntax };
}
