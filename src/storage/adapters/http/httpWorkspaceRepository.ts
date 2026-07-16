import {
  parseWorkspaceRepositoryCommit,
  parseWorkspaceRepositoryCommitResult,
  parseWorkspaceRepositorySnapshot,
} from "../../../../contracts/workspace-repository/parseRepository";
import { serializeJsonIteratively } from "../../../../contracts/workspace-repository/json";
import type { WorkspaceRepositoryBackend } from "../../repository/workspaceRepository";
import {
  requestRepositoryJson,
  type HttpRepositoryTransportOptions,
} from "./httpRepositoryTransport";

type HttpWorkspaceRepositoryOptions = HttpRepositoryTransportOptions & {
  repositoryId: string;
};

export function createHttpWorkspaceRepositoryBackend({
  baseUrl = "http://127.0.0.1:3001",
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  repositoryId,
  token,
}: HttpWorkspaceRepositoryOptions): WorkspaceRepositoryBackend {
  const endpoint = `/api/repositories/${encodeURIComponent(repositoryId)}/snapshot`;

  return {
    async commitRemoteSnapshot(commit) {
      const outbound = parseWorkspaceRepositoryCommit(commit);

      return parseWorkspaceRepositoryCommitResult(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          endpoint,
          {
            body: serializeJsonIteratively(outbound),
            headers: { "Content-Type": "application/json" },
            method: "PUT",
          },
          token,
        ),
      );
    },
    async loadRemoteSnapshot() {
      return parseWorkspaceRepositorySnapshot(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          endpoint,
          undefined,
          token,
        ),
      );
    },
  };
}
