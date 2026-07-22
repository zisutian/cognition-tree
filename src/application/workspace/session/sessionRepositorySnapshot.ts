import type {
  WorkspaceRepository,
  WorkspaceRepositorySnapshot,
} from "../../../storage/repository/workspaceRepository";
import {
  resolveWorkspaceSyntax,
  type WorkspaceSyntax,
} from "../../../../core/workspace/context/workspaceSyntax";
import { validateWorkspaceBlockMetadata } from "../../../../core/workspace/context/workspaceBlockMetadata";

export type WorkspaceSessionSnapshot = WorkspaceRepositorySnapshot & {
  workspaceSyntax: WorkspaceSyntax | null;
};

export function resolveWorkspaceSessionSnapshot(
  repositorySnapshot: WorkspaceRepositorySnapshot,
): WorkspaceSessionSnapshot {
  const { syntax } = repositorySnapshot.content;
  const activeSyntaxFile = syntax.activeFileId === null
    ? null
    : syntax.files.find(({ id }) => id === syntax.activeFileId) ?? null;
  const workspaceSyntax = resolveWorkspaceSyntax(activeSyntaxFile?.source ?? null);

  validateWorkspaceBlockMetadata(
    repositorySnapshot.content.workspace,
    workspaceSyntax?.profile ?? null,
  );

  return { ...repositorySnapshot, workspaceSyntax };
}

export async function loadWorkspaceSessionSnapshot(
  repository: WorkspaceRepository,
): Promise<WorkspaceSessionSnapshot> {
  return resolveWorkspaceSessionSnapshot(await repository.loadSnapshot());
}
