import {
  parseWorkspaceRepositoryCommit,
  parseWorkspaceRepositoryCommitResult,
  parseWorkspaceRepositorySnapshot,
} from "../../../contracts/workspace/parseRepository";
import { serializeJsonIteratively } from "../../../contracts/common/json";
import type { WorkspaceRepositoryBackend } from "../../../application/workspace/persistence/workspaceRepository";
import {
  requestRepositoryJson,
  type HttpRepositoryTransportOptions,
} from "./repositoryTransport";

type HttpWorkspaceRepositoryOptions = HttpRepositoryTransportOptions & {
  repositoryId: string;
};

export function createHttpWorkspaceRepositoryBackend({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  repositoryId,
  token,
}: HttpWorkspaceRepositoryOptions): WorkspaceRepositoryBackend {
  const endpoint =
    `/api/v1/sync/workspaces/${encodeURIComponent(repositoryId)}`;

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
