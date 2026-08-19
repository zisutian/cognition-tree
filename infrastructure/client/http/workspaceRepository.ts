import {
  parseWorkspaceRepositoryCommit,
  parseWorkspaceRepositoryCommitResult,
  parseWorkspaceRepositorySnapshot,
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
    `/api/v2/sync/workspaces/${encodeURIComponent(repositoryId)}`;
  const backend = createHttpVersionedContentRepositoryBackend({
    baseUrl,
    codec: {
      parseCommit: parseWorkspaceRepositoryCommit,
      parseCommitResult: parseWorkspaceRepositoryCommitResult,
      parseRevision: parseRepositoryRevision,
      parseSnapshot: parseWorkspaceRepositorySnapshot,
      serializeCommit: serializeJsonIteratively,
    },
    endpoint,
    fetch: fetchFn,
    token,
  });

  return {
    commitRemoteSnapshot: (commit) =>
      withWorkspaceApiAdapterErrors(() =>
        backend.commitRemoteSnapshot(commit)
      ),
    loadRemoteSnapshot: () =>
      withWorkspaceApiAdapterErrors(() => backend.loadRemoteSnapshot()),
  };
}
