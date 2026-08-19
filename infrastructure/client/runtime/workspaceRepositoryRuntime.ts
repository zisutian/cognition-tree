import { createClientActiveRepositorySelection } from "../platform/activeRepositorySelection";
import type { ClientApiConfiguration } from "./apiConfiguration";
import { createHttpWorkspaceRepositoryCatalog } from "../http/workspaceRepositoryCatalog";
import type { ActiveRepositorySelection } from "../../../application/repository/activeRepositorySelection";
import type { WorkspaceRepositoryCatalog } from "../../../application/repository/workspaceRepositoryCatalog";
import { createMemoryRepositoryClientCache } from "../repository/repositoryClientCache";
import { validateWorkspaceRepositoryContent } from "../repository/workspaceRepositoryContentValidation";

export type WorkspaceRepositoryRuntime = {
  activeRepositorySelection: ActiveRepositorySelection;
  catalog: WorkspaceRepositoryCatalog;
};

export function createWorkspaceRepositoryRuntime(
  api: ClientApiConfiguration,
): WorkspaceRepositoryRuntime {
  return {
    activeRepositorySelection: createClientActiveRepositorySelection(),
    catalog: createHttpWorkspaceRepositoryCatalog({
      baseUrl: api.baseUrl,
      cache: createMemoryRepositoryClientCache(),
      token: api.token,
      validateContent: validateWorkspaceRepositoryContent,
    }),
  };
}
