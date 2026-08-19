// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseJournalCommit,
  parseJournalCommitResult,
  parseJournalSnapshot,
} from "../../../contracts/journal/parseJournal";
import { parseBuiltInDescriptor } from "../../../contracts/built-ins/parseBuiltIns";
import { serializeJsonIteratively } from "../../../contracts/common/json";
import type {
  JournalRepository,
  JournalRepositoryBackend,
  JournalRepositoryProvider,
} from "../../../application/journal/persistence/journalRepository";
import type {
  JournalContentDto,
  JournalRevisionDto,
} from "../../../contracts/journal/types";
import { createVersionedLocalDraftRevision } from "../../../application/persistence/versionedRepository";
import { mergeJournalContent } from "../../../application/sync/domainThreeWayMerge";
import { journalRepositoryPreparation } from "../repository/journalRepositoryCodec";
import { createLocalFirstVersionedRepository } from "../repository/resilientVersionedRepository";
import type { VersionedRepositoryCache } from "../repository/versionedRepositoryCache";
import {
  createHttpRepositoryCacheIdentity,
  subscribeClientReconnect,
  type HttpRepositoryTransportOptions,
} from "./repositoryTransport";
import { createHttpVersionedContentRepositoryBackend } from "./versionedContentRepository";

type JournalRepositoryCache = VersionedRepositoryCache<
  JournalContentDto,
  JournalRevisionDto,
  `draft:${string}`
>;

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
  });
}

export function createHttpJournalRepositoryProvider({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  repositoryCache,
  token,
}: HttpRepositoryTransportOptions & {
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
