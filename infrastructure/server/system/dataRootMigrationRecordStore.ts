// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import type { DataRootMigrationRecord, DataRootMigrationRecordStore } from "../../../application/system/dataRootMigrationPorts.ts";
import { assertStateFields, requireStateRecord, SecureJsonPartition, type SecureStateFileReplacer } from "../state/secureJsonPartition.ts";

type MigrationState = { formatVersion: 1; current: DataRootMigrationRecord | null };

function requireText(value: unknown, label: string) {
  if (typeof value !== "string" || !value) throw new Error(`Migration ${label} is invalid`);
  return value;
}
function requirePath(value: unknown) {
  const result = requireText(value, "path");
  if (!path.isAbsolute(result) || path.normalize(result) !== result) throw new Error("Migration path is not canonical");
  return result;
}
function parseIdentity(value: unknown) {
  const identity = requireStateRecord(value, "migration identity");
  assertStateFields(identity, ["path", "device", "inode"], "migration identity");
  requirePath(identity.path);
  requireText(identity.device, "device");
  requireText(identity.inode, "inode");
  return identity;
}
function parseState(value: unknown): MigrationState {
  const state = requireStateRecord(value, "migration state");
  assertStateFields(state, ["formatVersion", "current"], "migration state");
  if (state.formatVersion !== 1) throw new Error("Unsupported migration state version");
  if (state.current === null) return { formatVersion: 1, current: null };
  const current = requireStateRecord(state.current, "migration");
  assertStateFields(current, ["commitOutcome", "destination", "errorMessage", "id", "source", "status", "change", "sourceIdentity", "targetIdentity", "manifestDigest"], "migration");
  requireText(current.id, "id");
  if (!["preparing", "copying", "verifying", "committing", "reconciling", "restarting", "completed", "failed", "recovery-required"].includes(String(current.status))) throw new Error("Invalid migration phase");
  if (!["not-committed", "committed", "unknown"].includes(String(current.commitOutcome))) throw new Error("Invalid migration commit outcome");
  if (current.errorMessage !== null && typeof current.errorMessage !== "string") throw new Error("Invalid migration error");
  if (current.manifestDigest !== null && !/^sha256:[a-f0-9]{64}$/.test(requireText(current.manifestDigest, "manifest digest"))) throw new Error("Invalid migration manifest digest");
  const change = requireStateRecord(current.change, "migration change");
  assertStateFields(change, ["baseRevision", "destination", "targetRevision"], "migration change");
  for (const revision of [change.baseRevision, change.targetRevision]) {
    if (!/^sha256:[a-f0-9]{64}$/.test(requireText(revision, "revision"))) throw new Error("Invalid migration revision");
  }
  if (requirePath(current.destination) !== requirePath(change.destination) ||
      requirePath(current.source) !== parseIdentity(current.sourceIdentity).path ||
      current.targetIdentity !== null && parseIdentity(current.targetIdentity).path !== current.destination) {
    throw new Error("Migration identities do not match its paths");
  }
  if ((current.status === "failed" && current.commitOutcome !== "not-committed") ||
      (["completed", "restarting"].includes(String(current.status)) && current.commitOutcome !== "committed") ||
      (["completed", "restarting", "committing"].includes(String(current.status)) && (!current.targetIdentity || !current.manifestDigest)) ||
      change.baseRevision === change.targetRevision || current.source === current.destination) {
    throw new Error("Migration phase lacks its required authority evidence");
  }
  return state as MigrationState;
}

export class FileDataRootMigrationRecordStore implements DataRootMigrationRecordStore {
  readonly #partition: SecureJsonPartition<MigrationState>;

  constructor(controlRoot: string, replaceFile?: SecureStateFileReplacer) {
    this.#partition = new SecureJsonPartition({
      createInitial: () => ({ formatVersion: 1, current: null }),
      directory: controlRoot,
      fileName: "data-root-migration-v1.json",
      name: "data-root migration",
      parse: parseState,
      ...(replaceFile ? { replaceFile } : {}),
    });
  }

  load() { return this.#partition.read((state) => state.current); }

  reconcile() { return this.#partition.reconcile((state) => state.current); }

  async replace(previous: DataRootMigrationRecord | null, next: DataRootMigrationRecord) {
    parseState({ formatVersion: 1, current: next });
    await this.#partition.mutate((state) => {
      if (JSON.stringify(state.current) !== JSON.stringify(previous)) throw new Error("Migration record changed concurrently");
      state.current = next;
      return { changed: true, result: undefined };
    });
  }
}
