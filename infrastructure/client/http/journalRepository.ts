// SPDX-License-Identifier: GPL-3.0-or-later

import { buildApiOperationPath } from "../../../contracts/api/index.ts";
import { serializeJsonIteratively, parseContentRevision } from "../../../contracts/common/index.ts";
import { parseJournalSnapshot, parseJournalSyncRequest, parseJournalSyncResult } from "../../../contracts/journal/index.ts";
import type { JournalRepositoryBackend } from "../../../application/journal/index.ts";
import type { HttpApiTransportOptions } from "./apiTransport.ts";
import { createHttpVersionedContentRepositoryBackend } from "./versionedContentRepository.ts";

export function createHttpJournalRepositoryBackend({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpApiTransportOptions): JournalRepositoryBackend {
  return createHttpVersionedContentRepositoryBackend({
    baseUrl,
    codec: {
      parseSyncRequest: parseJournalSyncRequest,
      parseSyncResult: parseJournalSyncResult,
      parseRevision: parseContentRevision,
      parseSnapshot: parseJournalSnapshot,
      serializeSyncRequest: serializeJsonIteratively,
    },
    endpoint: buildApiOperationPath("getJournalSyncSnapshot"),
    fetch: fetchFn,
    token,
  });
}
