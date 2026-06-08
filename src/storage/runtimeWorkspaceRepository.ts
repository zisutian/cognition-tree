import { createHttpWorkspaceRepository } from "./httpWorkspaceRepository";
import { createBrowserWorkspaceRepository } from "./browserWorkspaceRepository";
import type { WorkspaceRepository } from "./workspaceRepository";

export function createRuntimeWorkspaceRepository(): WorkspaceRepository {
  if (import.meta.env.VITE_CTN_STORAGE_MODE === "browser") {
    return createBrowserWorkspaceRepository();
  }

  return createHttpWorkspaceRepository({
    baseUrl: import.meta.env.VITE_CTN_API_BASE_URL,
  });
}
