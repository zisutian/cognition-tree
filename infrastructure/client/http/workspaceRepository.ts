import { buildApiOperationPath } from "../../../contracts/api/index.ts";
import {
  parseWorkspaceRepositorySnapshot,
  parseWorkspaceRepositorySyncRequest,
  parseWorkspaceRepositorySyncResult,
  parseRepositoryRevision,
} from "../../../contracts/workspace/index.ts";

import { serializeJsonIteratively } from "../../../contracts/common/index.ts";
import type { WorkspaceRepositoryBackend } from "../../../application/workspace/index.ts";
import type { HttpApiTransportOptions } from "./apiTransport.ts";
import { createHttpVersionedContentRepositoryBackend } from "./versionedContentRepository.ts";
import { withWorkspaceApiAdapterErrors } from "./workspaceApiAdapter.ts";

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
    buildApiOperationPath("getWorkspaceSyncSnapshot", { repositoryId: repositoryId });
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
