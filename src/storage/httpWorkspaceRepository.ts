import {
  type WorkspaceRepository,
} from "./workspaceRepository";
import {
  parseWorkspaceRepositoryCommitResult,
  parseWorkspaceRepositorySnapshot,
} from "../../contracts/workspace-repository/parseRepository";
import {
  requestRepositoryJson,
  type HttpRepositoryTransportOptions,
} from "./httpRepositoryTransport";

type HttpWorkspaceRepositoryOptions = HttpRepositoryTransportOptions & {
  label?: string;
  repositoryId: string;
};

export function createHttpWorkspaceRepository({
  baseUrl = "http://127.0.0.1:3001",
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  label,
  repositoryId,
  token,
}: HttpWorkspaceRepositoryOptions): WorkspaceRepository {
  const endpoint = `/api/repositories/${encodeURIComponent(repositoryId)}/snapshot`;

  return {
    label: label ?? repositoryId,
    async commitSnapshot(commit) {
      const result = parseWorkspaceRepositoryCommitResult(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          endpoint,
          {
            body: JSON.stringify(commit),
            headers: { "Content-Type": "application/json" },
            method: "PUT",
          },
          token,
        ),
      );

      return { ...result, availability: "online" };
    },
    async discardPendingCommit() {},
    async loadSnapshot() {
      const snapshot = parseWorkspaceRepositorySnapshot(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          endpoint,
          undefined,
          token,
        ),
      );

      return { ...snapshot, availability: "online" };
    },
  };
}
