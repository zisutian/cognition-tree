import { createHttpWorkspaceRepositoryCatalog } from "./httpWorkspaceRepositoryCatalog";
import { createBrowserWorkspaceRepositoryCatalog } from "./browserWorkspaceRepository";
import type { WorkspaceRepositoryCatalog } from "./workspaceRepositoryCatalog";

export function createRuntimeWorkspaceRepositoryCatalog(): WorkspaceRepositoryCatalog {
  if (import.meta.env.VITE_CTN_STORAGE_MODE === "browser") {
    return createBrowserWorkspaceRepositoryCatalog();
  }

  return createHttpWorkspaceRepositoryCatalog({
    baseUrl: import.meta.env.VITE_CTN_API_BASE_URL,
    token: import.meta.env.VITE_CTN_API_TOKEN,
  });
}
