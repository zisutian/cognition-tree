// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseSystemRepositoryCommit,
  parseSystemRepositoryCommitResult,
  parseSystemRepositorySnapshot,
} from "../../../../contracts/system-repository/parseRepository";
import { serializeJsonIteratively } from "../../../../contracts/workspace-repository/json";
import type {
  SystemRepositoryBackend,
  SystemRepositoryPurpose,
} from "../../repository/systemRepository";
import {
  requestRepositoryJson,
  type HttpRepositoryTransportOptions,
} from "./httpRepositoryTransport";

type HttpSystemRepositoryOptions = HttpRepositoryTransportOptions & {
  purpose: SystemRepositoryPurpose;
};

export function createHttpSystemRepositoryBackend({
  baseUrl = "http://127.0.0.1:3001",
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  purpose,
  token,
}: HttpSystemRepositoryOptions): SystemRepositoryBackend {
  const endpoint =
    `/api/system-repositories/${encodeURIComponent(purpose)}/snapshot`;

  return {
    async commitRemoteSnapshot(commit) {
      const outbound = parseSystemRepositoryCommit(commit, purpose);

      return parseSystemRepositoryCommitResult(
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
      return parseSystemRepositorySnapshot(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          endpoint,
          undefined,
          token,
        ),
        purpose,
      );
    },
  };
}
