import { createClientActiveRepositorySelection } from "../platform/index.ts";
import type { OfficialClientApi } from "../http/index.ts";
import { createHttpWorkspaceRepositoryCatalog } from "../http/index.ts";
import type {
  ActiveRepositorySelection,
  WorkspaceRepositoryCatalog,
} from "../../../application/repository/index.ts";

import type {
  WorkspaceRepositoryProvider,
  WorkspaceRepositoryProvisioner,
} from "../../../application/workspace/index.ts";
import {
  createMemoryRepositoryClientCache,
  workspaceRepositoryPreparation,
} from "../repository/index.ts";


export type WorkspaceRepositoryRuntime = {
  activeRepositorySelection: ActiveRepositorySelection;
  catalog: WorkspaceRepositoryCatalog;
  repositories: WorkspaceRepositoryProvider & WorkspaceRepositoryProvisioner;
};

export function createWorkspaceRepositoryRuntime(
  api: OfficialClientApi,
): WorkspaceRepositoryRuntime {
  const repositories = createHttpWorkspaceRepositoryCatalog({
    baseUrl: api.baseUrl,
    cache: createMemoryRepositoryClientCache(),
    preparation: workspaceRepositoryPreparation,
  });

  return {
    activeRepositorySelection: createClientActiveRepositorySelection(),
    catalog: repositories,
    repositories,
  };
}
