import { buildApiOperationPath } from "../../../contracts/api/index.ts";
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseJournalSnapshot,
  parseJournalSyncRequest,
  parseJournalSyncResult,
} from "../../../contracts/journal/index.ts";
import { parseBuiltInDescriptor } from "../../../contracts/built-ins/index.ts";
import {
  serializeJsonIteratively,
  parseContentRevision,
} from "../../../contracts/common/index.ts";
import type {
  JournalRepository,
  JournalRepositoryBackend,
  JournalRepositoryProvider,
} from "../../../application/journal/index.ts";
import type {
  JournalContentDto,
  JournalRevisionDto,
} from "../../../contracts/journal/index.ts";

import {
  createVersionedLocalDraftRevision,
  createLocalFirstVersionedRepository,
} from "../../../application/persistence/index.ts";
import { mergeJournalContent } from "../../../application/journal/index.ts";
import { journalRepositoryPreparation } from "../repository/index.ts";

import type { VersionedRepositoryCache } from "../../../application/persistence/index.ts";
import {
  subscribeClientReconnect,
  type HttpApiTransportOptions,
} from "./apiTransport.ts";
import { createHttpRepositoryCacheIdentity } from "./httpRepositoryIdentity.ts";
import { createHttpVersionedContentRepositoryBackend } from "./versionedContentRepository.ts";

type JournalRepositoryCache = VersionedRepositoryCache<
  JournalContentDto,
  JournalRevisionDto,
  `draft:${string}`
>;

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

export function createHttpJournalRepositoryProvider({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  repositoryCache,
  token,
}: HttpApiTransportOptions & {
  repositoryCache: JournalRepositoryCache;
}): JournalRepositoryProvider {
  let repository: JournalRepository | null = null;

  return {
    openJournal(value) {
      const descriptor = parseBuiltInDescriptor(value);

      if (descriptor.id !== "journal") {
        throw new Error("HTTP Journal descriptor is invalid");
      }
      repository ??= createLocalFirstVersionedRepository({
        backend: createHttpJournalRepositoryBackend({
          baseUrl,
          fetch: fetchFn,
          token,
        }),
        cache: repositoryCache,
        createLocalRevision: () =>
          createVersionedLocalDraftRevision<`draft:${string}`>(
            () => globalThis.crypto.randomUUID(),
          ),
        label: descriptor.label,
        loadPolicy: { mode: "refresh-remote" },
        location: descriptor.location,
        mergeContent: mergeJournalContent,
        repositoryIdentity: createHttpRepositoryCacheIdentity({
          baseUrl,
          repositoryId: "built-in:journal",
          token,
        }),
        subscribeReconnect: subscribeClientReconnect,
        preparation: journalRepositoryPreparation,
      });
      return repository;
    },
  };
}
