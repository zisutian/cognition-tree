// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  JournalParseIndex,
  JournalContent,
} from "../../../core/journal/index.ts";

import type {
  VersionedRepository,
  VersionedRepositoryBackend,
  VersionedRepositorySnapshot,
} from "../../persistence/index.ts";
import type {
  BuiltInDescriptor,
  BuiltInLocation,
} from "../../repository/index.ts";

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
