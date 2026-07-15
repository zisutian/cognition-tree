import {
  parseRepositoryCatalog,
  parseRepositoryDescriptor,
} from "../../contracts/workspace-repository/parseCatalog";
import { createHttpWorkspaceRepository } from "./httpWorkspaceRepository";
import {
  requestRepositoryJson,
  type HttpRepositoryTransportOptions,
} from "./httpRepositoryTransport";
import type { WorkspaceRepositoryCatalog } from "./workspaceRepositoryCatalog";

export function createHttpWorkspaceRepositoryCatalog({
  baseUrl = "http://127.0.0.1:3001",
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
}: HttpRepositoryTransportOptions = {}): WorkspaceRepositoryCatalog {
  return {
    async createRepository(input) {
      return parseRepositoryDescriptor(
        await requestRepositoryJson(fetchFn, baseUrl, "/api/repositories", {
          body: JSON.stringify(input),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }),
      );
    },
    label: "HTTP 后端",
    async listRepositories() {
      return parseRepositoryCatalog(
        await requestRepositoryJson(fetchFn, baseUrl, "/api/repositories"),
      ).repositories;
    },
    openRepository(descriptor) {
      if (descriptor.adapter === "browser") {
        throw new Error(
          `HTTP catalog cannot open browser repository: ${descriptor.id}`,
        );
      }

      return createHttpWorkspaceRepository({
        baseUrl,
        fetch: fetchFn,
        label: descriptor.label,
        repositoryId: descriptor.id,
      });
    },
  };
}
