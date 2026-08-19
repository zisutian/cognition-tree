// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  VersionedRepositoryBackend,
  VersionedRemoteCommit,
  VersionedRemoteSnapshot,
} from "../../../application/persistence/versionedRepository";
import {
  requestRepositoryJson,
  type HttpRepositoryTransportOptions,
} from "./repositoryTransport";

export type HttpVersionedContentCodec<Content, Revision extends string> = {
  parseCommit(
    value: unknown,
  ): VersionedRemoteCommit<Content, Revision>;
  parseCommitResult(value: unknown): { revision: Revision };
  parseSnapshot(value: unknown): VersionedRemoteSnapshot<Content, Revision>;
  serializeCommit(
    commit: VersionedRemoteCommit<Content, Revision>,
  ): string;
};

export function createHttpVersionedContentRepositoryBackend<
  Content,
  Revision extends string,
>({
  baseUrl,
  codec,
  endpoint,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpRepositoryTransportOptions & {
  codec: HttpVersionedContentCodec<Content, Revision>;
  endpoint: string;
}): VersionedRepositoryBackend<Content, Revision> {
  return {
    async commitRemoteSnapshot(commit) {
      const outbound = codec.parseCommit(commit);

      return codec.parseCommitResult(
        await requestRepositoryJson(
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
      );
    },
    async loadRemoteSnapshot() {
      return codec.parseSnapshot(
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
