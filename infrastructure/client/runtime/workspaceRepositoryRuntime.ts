import { createClientActiveRepositorySelection } from "../platform/activeRepositorySelection";
import type { OfficialClientApi } from "../http/apiTransport";
import { createHttpWorkspaceRepositoryCatalog } from "../http/workspaceRepositoryCatalog";
import type { ActiveRepositorySelection } from "../../../application/repository/activeRepositorySelection";
import type { WorkspaceRepositoryCatalog } from "../../../application/repository/workspaceRepositoryCatalog";
import type {
  WorkspaceRepositoryProvider,
  WorkspaceRepositoryProvisioner,
} from "../../../application/workspace/persistence/workspaceRepositoryProvider";
import { createMemoryRepositoryClientCache } from "../repository/repositoryClientCache";
import { workspaceRepositoryPreparation } from "../repository/workspaceRepositoryContentValidation";

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
