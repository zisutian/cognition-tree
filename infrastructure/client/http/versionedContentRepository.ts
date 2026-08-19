// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryRemoteError,
  VersionedRepositoryUnavailableError,
  type VersionedRepositoryBackend,
  type VersionedRemoteCommit,
  type VersionedRemoteSnapshot,
} from "../../../application/persistence/versionedRepository";
import {
  HttpApiResponseError,
  HttpApiUnavailableError,
  requestApiJson,
  type HttpApiTransportOptions,
} from "./apiTransport";

export type HttpVersionedContentCodec<Content, Revision extends string> = {
  parseCommit(
    value: unknown,
  ): VersionedRemoteCommit<Content, Revision>;
  parseCommitResult(value: unknown): { revision: Revision };
  parseRevision(value: unknown): Revision;
  parseSnapshot(value: unknown): VersionedRemoteSnapshot<Content, Revision>;
  serializeCommit(
    commit: VersionedRemoteCommit<Content, Revision>,
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
    async commitRemoteSnapshot(commit) {
      const outbound = codec.parseCommit(commit);

      return codec.parseCommitResult(await withVersionedRepositoryErrors(
        () => requestApiJson(
          fetchFn,
          baseUrl,
          endpoint,
          {
            body: codec.serializeCommit(outbound),
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
