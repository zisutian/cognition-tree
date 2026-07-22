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
import type { HttpRepositoryTransportOptions } from "./httpRepositoryTransport";
import { createHttpVersionedContentRepositoryBackend } from "./httpVersionedContentRepository";

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
  return createHttpVersionedContentRepositoryBackend({
    baseUrl,
    codec: {
      parseCommit(value) {
        return parseSystemRepositoryCommit(value, purpose);
      },
      parseCommitResult: parseSystemRepositoryCommitResult,
      parseSnapshot(value) {
        return parseSystemRepositorySnapshot(value, purpose);
      },
      serializeCommit: serializeJsonIteratively,
    },
    endpoint: `/api/system-repositories/${encodeURIComponent(purpose)}/snapshot`,
    fetch: fetchFn,
    token,
    validateContent,
    validateTransition,
  });
}
