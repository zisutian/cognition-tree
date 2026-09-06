import type {
  WorkspaceRepository,
  WorkspaceRepositoryContent,
  WorkspaceRepositorySnapshot,
} from "../persistence/workspaceRepository.ts";
import type {
  WorkspaceSyntax,
  NoteId,
  WorkspaceParseIndex,
} from "../../../core/workspace/index.ts";

import {
  type CtnCanonicalSourceAnalysis,
} from "../../../core/ctn/index.ts";

import {
  prepareWorkspaceRepositoryContent,
  type WorkspaceRepositoryPreparation,
} from "../persistence/workspaceRepositoryPreparation.ts";

export type WorkspaceSessionSnapshot = WorkspaceRepositorySnapshot & {
  workspaceSyntax: WorkspaceSyntax | null;
};

export type WorkspaceSessionProjection = WorkspaceRepositoryPreparation;

export function resolveWorkspaceSessionContent(
  content: WorkspaceRepositoryContent,
  previousIndex: WorkspaceParseIndex | null = null,
  analysisOverrides?: ReadonlyMap<NoteId, CtnCanonicalSourceAnalysis>,
): WorkspaceSessionProjection {
  return prepareWorkspaceRepositoryContent(content, {
    analysisOverrides,
    previousAnalysisIndex: previousIndex,
  });
}

export function resolveWorkspaceSessionSnapshot(
  repositorySnapshot: WorkspaceRepositorySnapshot,
): WorkspaceSessionSnapshot {
  return {
    ...repositorySnapshot,
    workspaceSyntax: repositorySnapshot.projection.workspaceSyntax,
  };
}

export async function loadWorkspaceSessionSnapshot(
  repository: WorkspaceRepository,
): Promise<WorkspaceSessionSnapshot> {
  return resolveWorkspaceSessionSnapshot(await repository.loadSnapshot());
}
