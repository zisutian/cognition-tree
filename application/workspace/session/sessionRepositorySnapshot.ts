import type {
  WorkspaceRepository,
  WorkspaceRepositoryContent,
  WorkspaceRepositorySnapshot,
} from "../persistence/workspaceRepository";
import type { WorkspaceSyntax } from "../../../core/workspace/context/workspaceSyntax";
import type { NoteId } from "../../../core/workspace/model/workspaceData";
import {
  type CtnCanonicalSourceAnalysis,
} from "../../../core/ctn/analysis/sourceAnalysis";
import type { WorkspaceParseIndex } from "../../../core/workspace/indexes/workspaceParseIndex";
import {
  prepareWorkspaceRepositoryContent,
  type WorkspaceRepositoryPreparation,
} from "../persistence/workspaceRepositoryPreparation";

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
