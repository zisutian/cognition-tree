// SPDX-License-Identifier: GPL-3.0-or-later

export {
  areMergeValuesEqual,
  createThreeWayContentMergeResult,
  crossesSyntaxMergeBarrier,
  mergeThreeWayMapValues,
  mergeThreeWayValue,
  reusePreparedMergeContent,
} from "./threeWayMerge.ts";
export {
  createLocalFirstVersionedRepository,
} from "./localFirst/localFirstRepository.ts";
export {
  createVersionedLocalDraftRevision,
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryBackendMergeConflictError,
  VersionedRepositoryLocalConflictError,
  VersionedRepositoryRemoteError,
  VersionedRepositoryUnavailableError,
} from "./versionedRepository.ts";
export {
  createVersionedSessionController,
} from "./versionedSessionController.ts";
export type {
  PreparedVersionedCommit,
  PreparedVersionedCommitReceipt,
  PreparedVersionedContent,
  PreparedVersionedSnapshot,
  PreparedVersionedStore,
  VersionedContentConflictPreference,
  VersionedContentMergePolicy,
  VersionedContentPreparationPolicy,
  VersionedRemoteSnapshot,
  VersionedRemoteSyncRequest,
  VersionedRemoteSyncResult,
  VersionedRepository,
  VersionedRepositoryBackend,
  VersionedRepositoryCodec,
  VersionedRepositoryConflictDetails,
  VersionedRepositoryConflictRecord,
  VersionedRepositoryContentValidator,
  VersionedRepositorySnapshot,
  VersionedRepositorySyncResult,
} from "./versionedRepository.ts";
export {
  SecureStateCommitOutcomeUnknownError,
  SecureStatePartitionError,
} from "./secureStateErrors.ts";
export type {
  ThreeWayContentMergeResult,
} from "./threeWayMerge.ts";
export {
  VersionedContentCommitOutcomeUnknownError,
  VersionedContentRevisionConflictError,
} from "./versionedCommitErrors.ts";
export type {
  VersionedRepositoryCache,
  VersionedRepositoryLocalState,
} from "./versionedRepositoryCache.ts";
export type {
  VersionedRepositoryLoadPolicy,
} from "./localFirst/localFirstRepository.ts";
export type {
  VersionedRepositoryPersistenceState,
} from "./versionedRepositorySaveQueue.ts";
export type {
  VersionedSessionState,
} from "./versionedSessionController.ts";
