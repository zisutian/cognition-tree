import { createClientActiveRepositorySelection } from "./client/clientActiveRepositorySelection";
import type { ClientApiConfiguration } from "./client/clientApiConfiguration";
import { createHttpWorkspaceRepositoryCatalog } from "./http/httpWorkspaceRepositoryCatalog";
import type { ActiveRepositorySelection } from "../application/repository/activeRepositorySelection";
import type { WorkspaceRepositoryCatalog } from "../application/repository/workspaceRepositoryCatalog";
import { createMemoryRepositoryClientCache } from "./persistence/repositoryClientCache";
import { validateWorkspaceRepositoryContent } from "./persistence/workspaceRepositoryContentValidation";

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
