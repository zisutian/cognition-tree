// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalParseIndex } from "../../../core/journal/indexes/journalParseIndex";
import type { JournalContent } from "../../../core/journal/model/journalContent";
import type {
  VersionedRepository,
  VersionedRepositoryBackend,
  VersionedRepositorySnapshot,
} from "../../persistence/versionedRepository";
import type {
  BuiltInDescriptor,
  BuiltInLocation,
} from "../../repository/builtInCatalog";

export type JournalRevision = `sha256:${string}`;
export type JournalLocalDraftRevision = `draft:${string}`;

export type JournalRepositoryBackend = VersionedRepositoryBackend<
  JournalContent,
  JournalRevision
>;
export type JournalRepositorySnapshot = VersionedRepositorySnapshot<
  JournalContent,
  JournalRevision,
  JournalLocalDraftRevision,
  JournalParseIndex
>;
export type JournalRepository = VersionedRepository<
  JournalContent,
  JournalRevision,
  JournalLocalDraftRevision,
  BuiltInLocation,
  JournalParseIndex
>;

export type JournalRepositoryProvider = {
  openJournal(descriptor: BuiltInDescriptor): JournalRepository;
};
