// SPDX-License-Identifier: GPL-3.0-or-later

import { buildApiOperationPath } from "../../../contracts/api/index.ts";
import { serializeJsonIteratively, parseContentRevision } from "../../../contracts/common/index.ts";
import { parseTodoSnapshot, parseTodoSyncRequest, parseTodoSyncResult } from "../../../contracts/todo/index.ts";
import type { TodoRepositoryBackend } from "../../../application/todo/index.ts";
import type { HttpApiTransportOptions } from "./apiTransport.ts";
import { createHttpVersionedContentRepositoryBackend } from "./versionedContentRepository.ts";

export function createHttpTodoRepositoryBackend({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpApiTransportOptions): TodoRepositoryBackend {
  return createHttpVersionedContentRepositoryBackend({
    baseUrl,
    codec: {
      parseSyncRequest: parseTodoSyncRequest,
      parseSyncResult: parseTodoSyncResult,
      parseRevision: parseContentRevision,
      parseSnapshot: parseTodoSnapshot,
      serializeSyncRequest: serializeJsonIteratively,
    },
    endpoint: buildApiOperationPath("getTodoSyncSnapshot"),
    fetch: fetchFn,
    token,
  });
}
