// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseJournalCommit,
  parseJournalCommitResult,
  parseJournalSnapshot,
} from "../../contracts/journal/parseJournal";
import { serializeJsonIteratively } from "../../contracts/common/json";
import type { JournalRepositoryBackend } from "../../application/repository/builtInRepository";
import {
  validateJournalRepositoryContent,
  validateJournalRepositoryTransition,
} from "../persistence/journalRepository";
import type { HttpRepositoryTransportOptions } from "./httpRepositoryTransport";
import { createHttpVersionedContentRepositoryBackend } from "./httpVersionedContentRepository";

export function createHttpJournalRepositoryBackend({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpRepositoryTransportOptions): JournalRepositoryBackend {
  return createHttpVersionedContentRepositoryBackend({
    baseUrl,
    codec: {
      parseCommit: parseJournalCommit,
      parseCommitResult: parseJournalCommitResult,
      parseSnapshot: parseJournalSnapshot,
      serializeCommit: serializeJsonIteratively,
    },
    endpoint: "/api/v1/sync/journal",
    fetch: fetchFn,
    token,
    validateContent: validateJournalRepositoryContent,
    validateTransition: validateJournalRepositoryTransition,
  });
}
