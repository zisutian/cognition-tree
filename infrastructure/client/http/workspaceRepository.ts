import {
  parseWorkspaceRepositorySnapshot,
  parseWorkspaceRepositorySyncRequest,
  parseWorkspaceRepositorySyncResult,
} from "../../../contracts/workspace/parseRepository";
import { parseRepositoryRevision } from "../../../contracts/workspace/revision";
import { serializeJsonIteratively } from "../../../contracts/common/json";
import type { WorkspaceRepositoryBackend } from "../../../application/workspace/persistence/workspaceRepository";
import type { HttpApiTransportOptions } from "./apiTransport";
import { createHttpVersionedContentRepositoryBackend } from "./versionedContentRepository";
import { withWorkspaceApiAdapterErrors } from "./workspaceApiAdapter";

type HttpWorkspaceRepositoryOptions = HttpApiTransportOptions & {
  repositoryId: string;
};

export function createHttpWorkspaceRepositoryBackend({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  repositoryId,
  token,
}: HttpWorkspaceRepositoryOptions): WorkspaceRepositoryBackend {
  const endpoint =
    `/api/v3/sync/workspaces/${encodeURIComponent(repositoryId)}`;
  const backend = createHttpVersionedContentRepositoryBackend({
    baseUrl,
    codec: {
      parseSyncRequest: parseWorkspaceRepositorySyncRequest,
      parseSyncResult: parseWorkspaceRepositorySyncResult,
      parseRevision: parseRepositoryRevision,
      parseSnapshot: parseWorkspaceRepositorySnapshot,
      serializeSyncRequest: serializeJsonIteratively,
    },
    endpoint,
    fetch: fetchFn,
    token,
  });

  return {
    synchronizeRemoteSnapshot: (request) =>
      withWorkspaceApiAdapterErrors(() =>
        backend.synchronizeRemoteSnapshot(request)
      ),
    loadRemoteSnapshot: () =>
      withWorkspaceApiAdapterErrors(() => backend.loadRemoteSnapshot()),
  };
}
