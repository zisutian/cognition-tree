// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  VersionedRepositoryConflictDetails,
} from "../persistence/versionedRepository";

export type RepositoryLocationRow = {
  copyValue: string;
  label: string;
  value: string;
};

export type RepositoryConflictResolutionView = {
  keepLocal: () => Promise<void>;
  loadDetails: () => Promise<VersionedRepositoryConflictDetails<string>>;
  recoverLocalCopy: () => Promise<void>;
  useRemote: () => Promise<void>;
};

export type RepositoryRecoveryAction = {
  label: string;
  run: () => Promise<void>;
};
