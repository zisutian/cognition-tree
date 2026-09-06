// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VersionedRepositoryRemoteError,
  VersionedRepositoryUnavailableError,
} from "../versionedRepository.ts";
import {
  areMergeValuesEqual,
} from "../threeWayMerge.ts";

export function versionedRepositoryErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Repository synchronization failed";
}

export function isRetryableVersionedRepositoryRemoteError(error: unknown) {
  return error instanceof VersionedRepositoryUnavailableError ||
    (error instanceof VersionedRepositoryRemoteError && error.retryable);
}

export function canUseVersionedRepositoryCachedSnapshot(error: unknown) {
  return isRetryableVersionedRepositoryRemoteError(error) &&
    !(error instanceof VersionedRepositoryRemoteError &&
      error.code === "repository_busy");
}

export function versionedContentEqual<Content>(
  left: Content,
  right: Content,
) {
  return areMergeValuesEqual(left, right);
}

export function normalizeVersionedConflictUnitIds(
  unitIds: readonly string[],
) {
  return [...new Set(unitIds)].sort();
}
