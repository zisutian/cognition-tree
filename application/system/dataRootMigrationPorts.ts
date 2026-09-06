// SPDX-License-Identifier: GPL-3.0-or-later

import type { BootstrapConfigurationSnapshot } from "./systemConfigurationPorts.ts";

export type DataRootMigrationPhase = "preparing" | "copying" | "verifying" | "committing" |
  "reconciling" | "restarting" | "completed" | "failed" | "recovery-required";
export type DataRootCommitOutcome = "not-committed" | "committed" | "unknown";
export type DataRootMigrationStatus = Readonly<{
  commitOutcome: DataRootCommitOutcome;
  destination: string;
  errorMessage: string | null;
  id: string;
  source: string;
  status: DataRootMigrationPhase;
}>;
export type DataRootDirectoryIdentity = Readonly<{ path: string; device: string; inode: string }>;
export type PreparedDataRootChange = Readonly<{
  baseRevision: `sha256:${string}`;
  destination: string;
  targetRevision: `sha256:${string}`;
}>;
export type DataRootMigrationRecord = DataRootMigrationStatus & Readonly<{
  change: PreparedDataRootChange;
  sourceIdentity: DataRootDirectoryIdentity;
  targetIdentity: DataRootDirectoryIdentity | null;
  manifestDigest: string | null;
}>;

export type DataRootMigrationRecordStore = {
  load(): Promise<DataRootMigrationRecord | null>;
  reconcile(): Promise<DataRootMigrationRecord | null>;
  replace(previous: DataRootMigrationRecord | null, next: DataRootMigrationRecord): Promise<void>;
};
export type DataRootMigrationBootstrapPort = {
  readSnapshot(): Promise<BootstrapConfigurationSnapshot>;
  prepareDataRootChange(baseRevision: string, destination: string): Promise<PreparedDataRootChange>;
  commitDataRootChange(change: PreparedDataRootChange): Promise<void>;
  reconcileDataRootChange(change: PreparedDataRootChange): Promise<Exclude<DataRootCommitOutcome, "unknown">>;
};
export type DataRootMigrationFiles = {
  prepareDestination(destination: string, source: string, control: string): Promise<string>;
  identify(directory: string): Promise<DataRootDirectoryIdentity>;
  copy(source: DataRootDirectoryIdentity, destination: string, allocated: (target: DataRootDirectoryIdentity) => Promise<void>): Promise<void>;
  verify(source: DataRootDirectoryIdentity, target: DataRootDirectoryIdentity): Promise<string>;
  verifyTarget(target: DataRootDirectoryIdentity, manifestDigest: string): Promise<void>;
};

export function isDataRootMigrationTerminal(status: DataRootMigrationPhase) {
  return status === "completed" || status === "failed";
}

export function projectDataRootMigration(record: DataRootMigrationRecord): DataRootMigrationStatus {
  const { commitOutcome, destination, errorMessage, id, source, status } = record;
  return { commitOutcome, destination, errorMessage, id, source, status };
}
