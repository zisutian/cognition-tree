// SPDX-License-Identifier: GPL-3.0-or-later

import { createClientUuid } from "../platform/index.ts";
import { parseBuiltInDescriptor } from "../../../contracts/built-ins/index.ts";
import type { JournalContentDto, JournalRevisionDto } from "../../../contracts/journal/index.ts";
import { type JournalRepository, type JournalRepositoryProvider, mergeJournalContent, journalRepositoryPreparation } from "../../../application/journal/index.ts";
import { type VersionedRepositoryCache, createVersionedLocalDraftRevision, createLocalFirstVersionedRepository } from "../../../application/persistence/index.ts";
import { type HttpApiTransportOptions, createHttpJournalRepositoryBackend, createHttpRepositoryCacheIdentity, subscribeClientReconnect } from "../http/index.ts";

type JournalRepositoryCache = VersionedRepositoryCache<JournalContentDto, JournalRevisionDto, `draft:${string}`>;

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
            createClientUuid,
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
