import type {
  WorkspaceRepository,
  WorkspaceRepositoryContent,
  WorkspaceRepositorySnapshot,
} from "../../repository/workspaceRepository";
import {
  attachWorkspaceSyntax,
  type WorkspaceContext,
} from "../../../core/workspace/context/workspaceContext";
import {
  resolveWorkspaceSyntax,
  type WorkspaceSyntax,
} from "../../../core/workspace/context/workspaceSyntax";
import { validateWorkspaceTitleBlockMetadata } from "../../../core/workspace/context/workspaceBlockMetadata";
import {
  createWorkspaceStructureIndex,
  type WorkspaceStructureIndex,
} from "../../../core/workspace/indexes/workspaceStructureIndex";
import type { NoteId } from "../../../core/workspace/model/workspaceData";
import {
  type CtnCanonicalSourceAnalysis,
} from "../../../core/ctn/analysis/sourceAnalysis";
import {
  createWorkspaceParseIndex,
  type WorkspaceParseIndex,
} from "../../../core/workspace/indexes/workspaceParseIndex";

export type WorkspaceSessionSnapshot = WorkspaceRepositorySnapshot & {
  workspaceSyntax: WorkspaceSyntax | null;
};

export type WorkspaceSessionProjection = {
  analysisIndex: WorkspaceParseIndex | null;
  context: WorkspaceContext | null;
  workspace: WorkspaceStructureIndex;
  workspaceSyntax: WorkspaceSyntax | null;
};

export function resolveWorkspaceSessionContent(
  content: WorkspaceRepositoryContent,
  previousIndex: WorkspaceParseIndex | null = null,
  analysisOverrides?: ReadonlyMap<NoteId, CtnCanonicalSourceAnalysis>,
): WorkspaceSessionProjection {
  const { syntax } = content;
  const activeSyntaxFile = syntax.activeFileId === null
    ? null
    : syntax.files.find(({ id }) => id === syntax.activeFileId) ?? null;
  const workspaceSyntax = resolveWorkspaceSyntax(activeSyntaxFile?.source ?? null);

  const workspace = createWorkspaceStructureIndex(content.workspace);
  const analysisIndex = workspaceSyntax
    ? createWorkspaceParseIndex(
        {
          analysisOverrides,
          syntax: workspaceSyntax.syntax,
          workspace,
        },
        previousIndex,
      )
    : null;

  if (!workspaceSyntax) {
    validateWorkspaceTitleBlockMetadata(content.workspace);
  }

  return {
    analysisIndex,
    context: workspaceSyntax
      ? attachWorkspaceSyntax(workspace, workspaceSyntax.syntax)
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
