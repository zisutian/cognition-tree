// SPDX-License-Identifier: GPL-3.0-or-later

import { projectWorkspaceMutation } from "./workspaceDomainProjection.ts";
import type {
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation,
} from "../persistence/workspaceRepository.ts";
import type { WorkspaceResourceVersionPolicy } from "./workspaceAgentCommandPreparation.ts";

export function projectWorkspaceContentChanges(
  repositoryId: string,
  before: WorkspaceRepositoryContent,
  after: WorkspaceRepositoryContent,
  timestamp: string,
  beforePreparation: WorkspaceRepositoryPreparation,
  afterPreparation: WorkspaceRepositoryPreparation,
  versionPolicy: WorkspaceResourceVersionPolicy,
) {
  return projectWorkspaceMutation({
    after: after.workspace,
    afterContext: {
      index: afterPreparation.analysisIndex,
      structure: afterPreparation.workspace,
      syntax: afterPreparation.workspaceSyntax?.syntax ?? null,
    },
    before: before.workspace,
    beforeContext: {
      index: beforePreparation.analysisIndex,
      structure: beforePreparation.workspace,
      syntax: beforePreparation.workspaceSyntax?.syntax ?? null,
    },
    repositoryId,
    timestamp,
    versions: {
      folder: versionPolicy.folder,
      note: versionPolicy.note,
      tree: (workspace) => versionPolicy.tree(before, workspace),
    },
  });
}
