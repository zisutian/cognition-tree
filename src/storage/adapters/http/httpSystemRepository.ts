// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseSystemRepositoryCommit,
  parseSystemRepositoryCommitResult,
  parseSystemRepositorySnapshot,
} from "../../../../contracts/system-repository/parseRepository";
import { serializeJsonIteratively } from "../../../../contracts/workspace-repository/json";
import type {
  SystemRepositoryBackend,
  SystemRepositoryContentValidator,
  SystemRepositoryPurpose,
  SystemRepositoryTransitionValidator,
} from "../../repository/systemRepository";
import {
  requestRepositoryJson,
  type HttpRepositoryTransportOptions,
} from "./httpRepositoryTransport";

type HttpSystemRepositoryOptions = HttpRepositoryTransportOptions & {
  purpose: SystemRepositoryPurpose;
  validateContent: SystemRepositoryContentValidator;
  validateTransition: SystemRepositoryTransitionValidator;
};

export function createHttpSystemRepositoryBackend({
  baseUrl = "http://127.0.0.1:3001",
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  purpose,
  token,
  validateContent,
  validateTransition,
}: HttpSystemRepositoryOptions): SystemRepositoryBackend {
  const endpoint =
    `/api/system-repositories/${encodeURIComponent(purpose)}/snapshot`;
  let knownSnapshot: Awaited<
    ReturnType<SystemRepositoryBackend["loadRemoteSnapshot"]>
  > | null = null;

  return {
    async commitRemoteSnapshot(commit) {
      const outbound = parseSystemRepositoryCommit(commit, purpose);

      validateContent(outbound.content);
      if (knownSnapshot?.revision === outbound.baseRevision) {
        validateTransition(knownSnapshot.content, outbound.content);
      }

      const result = parseSystemRepositoryCommitResult(
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

      knownSnapshot = {
        content: structuredClone(outbound.content),
        revision: result.revision,
      };
      return result;
    },
    async loadRemoteSnapshot() {
      const snapshot = parseSystemRepositorySnapshot(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          endpoint,
          undefined,
          token,
        ),
        purpose,
      );

      validateContent(snapshot.content);
      knownSnapshot = structuredClone(snapshot);
      return snapshot;
    },
  };
}
