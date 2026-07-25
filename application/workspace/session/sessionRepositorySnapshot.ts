import type {
  WorkspaceRepository,
  WorkspaceRepositoryContent,
  WorkspaceRepositorySnapshot,
} from "../../repository/workspaceRepository";
import {
  attachWorkspaceSyntaxProfile,
  type WorkspaceContext,
} from "../../../core/workspace/context/workspaceContext";
import {
  resolveWorkspaceSyntax,
  type WorkspaceSyntax,
} from "../../../core/workspace/context/workspaceSyntax";
import { validateWorkspaceBlockMetadata } from "../../../core/workspace/context/workspaceBlockMetadata";
import {
  createWorkspaceStructureIndex,
  type WorkspaceStructureIndex,
} from "../../../core/workspace/indexes/workspaceStructureIndex";

export type WorkspaceSessionSnapshot = WorkspaceRepositorySnapshot & {
  workspaceSyntax: WorkspaceSyntax | null;
};

export type WorkspaceSessionProjection = {
  context: WorkspaceContext | null;
  workspace: WorkspaceStructureIndex;
  workspaceSyntax: WorkspaceSyntax | null;
};

export function resolveWorkspaceSessionContent(
  content: WorkspaceRepositoryContent,
): WorkspaceSessionProjection {
  const { syntax } = content;
  const activeSyntaxFile = syntax.activeFileId === null
    ? null
    : syntax.files.find(({ id }) => id === syntax.activeFileId) ?? null;
  const workspaceSyntax = resolveWorkspaceSyntax(activeSyntaxFile?.source ?? null);

  validateWorkspaceBlockMetadata(
    content.workspace,
    workspaceSyntax?.profile ?? null,
  );
  const workspace = createWorkspaceStructureIndex(content.workspace);

  return {
    context: workspaceSyntax
      ? attachWorkspaceSyntaxProfile(workspace, workspaceSyntax.profile)
      : null,
    workspace,
    workspaceSyntax,
  };
}

export function resolveWorkspaceSessionSnapshot(
  repositorySnapshot: WorkspaceRepositorySnapshot,
): WorkspaceSessionSnapshot {
  const { workspaceSyntax } = resolveWorkspaceSessionContent(
    repositorySnapshot.content,
  );

  return { ...repositorySnapshot, workspaceSyntax };
}

export async function loadWorkspaceSessionSnapshot(
  repository: WorkspaceRepository,
): Promise<WorkspaceSessionSnapshot> {
  return resolveWorkspaceSessionSnapshot(await repository.loadSnapshot());
}
