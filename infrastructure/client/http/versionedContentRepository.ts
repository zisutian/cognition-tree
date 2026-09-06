// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryBackendMergeConflictError,
  VersionedRepositoryRemoteError,
  VersionedRepositoryUnavailableError,
  type VersionedRepositoryBackend,
  type VersionedRemoteSnapshot,
  type VersionedRemoteSyncRequest,
  type VersionedRemoteSyncResult,
} from "../../../application/persistence/index.ts";
import {
  HttpApiResponseError,
  HttpApiUnavailableError,
  requestApiJson,
  type HttpApiTransportOptions,
} from "./apiTransport.ts";

export type HttpVersionedContentCodec<Content, Revision extends string> = {
  parseSyncRequest(
    value: unknown,
  ): VersionedRemoteSyncRequest<Content, Revision>;
  parseSyncResult(
    value: unknown,
  ): VersionedRemoteSyncResult<Content, Revision>;
  parseRevision(value: unknown): Revision;
  parseSnapshot(value: unknown): VersionedRemoteSnapshot<Content, Revision>;
  serializeSyncRequest(
    request: VersionedRemoteSyncRequest<Content, Revision>,
  ): string;
};

async function withVersionedRepositoryErrors<Result, Revision extends string>(
  request: () => Promise<Result>,
  parseRevision: (value: unknown) => Revision,
) {
  try {
    return await request();
  } catch (error) {
    if (error instanceof HttpApiUnavailableError) {
      throw new VersionedRepositoryUnavailableError(error.message);
    }
    if (error instanceof HttpApiResponseError) {
      if (
        error.apiCode === "merge_conflict" &&
        typeof error.details?.baseRevision === "string" &&
        typeof error.details.currentRevision === "string" &&
        Array.isArray(error.details.conflictUnits)
      ) {
        throw new VersionedRepositoryBackendMergeConflictError({
          baseRevision: parseRevision(error.details.baseRevision),
          currentRevision: parseRevision(error.details.currentRevision),
          unitIds: error.details.conflictUnits.flatMap((unit) =>
            unit && typeof unit === "object" && "id" in unit &&
                typeof unit.id === "string"
              ? [unit.id]
              : []
          ),
        });
      }
      if (
        error.apiCode === "resource_conflict" &&
        typeof error.details?.currentRevision === "string"
      ) {
        throw new VersionedRepositoryBackendConflictError(
          parseRevision(error.details.currentRevision),
        );
      }
      throw new VersionedRepositoryRemoteError(error.message, {
        code: error.apiCode,
        retryable: error.retryable,
      });
    }
    throw error;
  }
}

export function createHttpVersionedContentRepositoryBackend<
  Content,
  Revision extends string,
>({
  baseUrl,
  codec,
  endpoint,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpApiTransportOptions & {
  codec: HttpVersionedContentCodec<Content, Revision>;
  endpoint: string;
}): VersionedRepositoryBackend<Content, Revision> {
  return {
    async synchronizeRemoteSnapshot(request) {
      const outbound = codec.parseSyncRequest(request);

      return codec.parseSyncResult(await withVersionedRepositoryErrors(
        () => requestApiJson(
          fetchFn,
          baseUrl,
          endpoint,
          {
            body: codec.serializeSyncRequest(outbound),
            headers: { "Content-Type": "application/json" },
            method: "PUT",
          },
          token,
        ),
        codec.parseRevision,
      ));
    },
    async loadRemoteSnapshot() {
      return codec.parseSnapshot(await withVersionedRepositoryErrors(
        () => requestApiJson(
          fetchFn,
          baseUrl,
          endpoint,
          undefined,
          token,
        ),
        codec.parseRevision,
      ));
    },
  };
}
