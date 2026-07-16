import { createBrowserActiveRepositorySelection } from "../adapters/browser/browserActiveRepositorySelection";
import { createBrowserRepositoryClientCache } from "../adapters/browser/browserRepositoryClientCache";
import { createBrowserWorkspaceRepositoryCatalog } from "../adapters/browser/browserWorkspaceRepository";
import { createHttpWorkspaceRepositoryCatalog } from "../adapters/http/httpWorkspaceRepositoryCatalog";
import type { ActiveRepositorySelection } from "../repository/activeRepositorySelection";
import type { WorkspaceRepositoryCatalog } from "../repository/workspaceRepositoryCatalog";
import { validateWorkspaceRepositoryContent } from "./workspaceRepositoryContentValidation";

export type WorkspaceRepositoryRuntime = {
  activeRepositorySelection: ActiveRepositorySelection;
  catalog: WorkspaceRepositoryCatalog;
};

export function createWorkspaceRepositoryRuntime(): WorkspaceRepositoryRuntime {
  return {
    activeRepositorySelection: createBrowserActiveRepositorySelection(),
    catalog: import.meta.env.VITE_CTN_STORAGE_MODE === "browser"
      ? createBrowserWorkspaceRepositoryCatalog({
          validateContent: validateWorkspaceRepositoryContent,
        })
      : createHttpWorkspaceRepositoryCatalog({
          baseUrl: import.meta.env.VITE_CTN_API_BASE_URL,
          cache: createBrowserRepositoryClientCache(),
          token: import.meta.env.VITE_CTN_API_TOKEN,
          validateContent: validateWorkspaceRepositoryContent,
        }),
  };
}
