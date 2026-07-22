// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  VersionedRepositoryBackend,
  VersionedRemoteCommit,
  VersionedRemoteSnapshot,
} from "../../application/repository/versionedRepository";
import {
  requestRepositoryJson,
  type HttpRepositoryTransportOptions,
} from "./httpRepositoryTransport";

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
  baseUrl = "http://127.0.0.1:3001",
  codec,
  endpoint,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
  validateContent,
  validateTransition,
}: HttpRepositoryTransportOptions & {
  codec: HttpVersionedContentCodec<Content, Revision>;
  endpoint: string;
  validateContent(content: Content): void;
  validateTransition(previous: Content, next: Content): void;
}): VersionedRepositoryBackend<Content, Revision> {
  let knownSnapshot: VersionedRemoteSnapshot<Content, Revision> | null = null;

  return {
    async commitRemoteSnapshot(commit) {
      const outbound = codec.parseCommit(commit);

      validateContent(outbound.content);
      if (knownSnapshot?.revision === outbound.baseRevision) {
        validateTransition(knownSnapshot.content, outbound.content);
      }
      const result = codec.parseCommitResult(
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

      knownSnapshot = {
        content: structuredClone(outbound.content),
        revision: result.revision,
      };
      return result;
    },
    async loadRemoteSnapshot() {
      const snapshot = codec.parseSnapshot(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          endpoint,
          undefined,
          token,
        ),
      );

      validateContent(snapshot.content);
      knownSnapshot = structuredClone(snapshot);
      return snapshot;
    },
  };
}
