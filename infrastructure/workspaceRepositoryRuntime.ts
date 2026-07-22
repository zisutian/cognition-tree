import { createBrowserActiveRepositorySelection } from "./browser/browserActiveRepositorySelection";
import { createBrowserRepositoryClientCache } from "./browser/browserRepositoryClientCache";
import { createBrowserWorkspaceRepositoryCatalog } from "./browser/browserWorkspaceRepository";
import { createHttpWorkspaceRepositoryCatalog } from "./http/httpWorkspaceRepositoryCatalog";
import type { ActiveRepositorySelection } from "../application/repository/activeRepositorySelection";
import type { WorkspaceRepositoryCatalog } from "../application/repository/workspaceRepositoryCatalog";
import { validateWorkspaceRepositoryContent } from "./persistence/workspaceRepositoryContentValidation";

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
