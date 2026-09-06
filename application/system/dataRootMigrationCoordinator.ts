// SPDX-License-Identifier: GPL-3.0-or-later

import { type SystemMaintenanceLease, type SystemMaintenancePort } from "./systemConfiguration.ts";
import { SystemMigrationConflictError, SystemMigrationNotFoundError } from "./systemConfigurationModel.ts";
import { isDataRootMigrationTerminal, projectDataRootMigration, type DataRootMigrationBootstrapPort, type DataRootMigrationFiles, type DataRootMigrationRecord, type DataRootMigrationRecordStore, type DataRootMigrationStatus } from "./dataRootMigrationPorts.ts";
import type { DataRootMigrationPort } from "./systemAdministrationService.ts";

type Dependencies = {
  bootstrap: DataRootMigrationBootstrapPort;
  controlRoot: string;
  createId(): string;
  files: DataRootMigrationFiles;
  hasActiveAgentWork(): boolean;
  maintenance: SystemMaintenancePort;
  records: DataRootMigrationRecordStore;
  requestRestart(): Promise<void>;
};

function message(error: unknown) { return error instanceof Error ? error.message : "Data-root migration failed"; }

export class DataRootMigrationCoordinator implements DataRootMigrationPort {
  readonly #dependencies: Dependencies;
  #record: DataRootMigrationRecord | null = null;
  #lease: SystemMaintenanceLease | null = null;
  #starting = false;
  #work: Promise<void> | null = null;
  #recordUnavailable = false;

  constructor(dependencies: Dependencies) { this.#dependencies = dependencies; }

  async current(): Promise<DataRootMigrationStatus | null> {
    this.#record ??= await this.#dependencies.records.load();
    return this.#record ? projectDataRootMigration(this.#record) : null;
  }

  async get(id: string) {
    const status = await this.current();
    if (!status || status.id !== id) throw new SystemMigrationNotFoundError();
    return status;
  }

  async start(baseRevision: string, destination: string) {
    if (this.#starting || this.#work || this.#lease || this.#recordUnavailable) throw new SystemMigrationConflictError("A data-root migration is already active");
    this.#starting = true;
    try {
      const previous = await this.#dependencies.records.load();
      if (previous && !isDataRootMigrationTerminal(previous.status)) throw new SystemMigrationConflictError("A data-root migration needs recovery");
      this.#assertAgentIdle();
      const snapshot = await this.#dependencies.bootstrap.readSnapshot();
      if (snapshot.revision !== baseRevision) throw new SystemMigrationConflictError("System configuration revision changed", snapshot.revision);
      const source = snapshot.configuration.dataRoot;
      const target = await this.#dependencies.files.prepareDestination(destination, source, this.#dependencies.controlRoot);
      const change = await this.#dependencies.bootstrap.prepareDataRootChange(baseRevision, target);
      const next: DataRootMigrationRecord = {
        change, commitOutcome: "not-committed", destination: target, errorMessage: null,
        id: this.#dependencies.createId(), manifestDigest: null, source,
        sourceIdentity: await this.#dependencies.files.identify(source), status: "preparing", targetIdentity: null,
      };
      try { await this.#dependencies.records.replace(previous, next); }
      catch (error) { this.#recordUnavailable = true; throw error; }
      this.#record = next;
      this.#run(() => this.#execute());
      return projectDataRootMigration(next);
    } finally { this.#starting = false; }
  }

  async reconcile(id: string) {
    const status = await this.get(id);
    if (this.#work) return status;
    if (this.#recordUnavailable) {
      await this.#reloadRecord();
      if (this.#record?.id !== id) throw new SystemMigrationNotFoundError();
    }
    if (isDataRootMigrationTerminal(status.status)) return status;
    this.#run(async () => {
      this.#lease ??= await this.#dependencies.maintenance.begin();
      await this.#reconcile(false, null);
    });
    return this.get(id);
  }

  async #reloadRecord() {
    this.#record = await this.#dependencies.records.reconcile();
    this.#recordUnavailable = false;
  }

  async recoverOnStartup() {
    if (this.#work || this.#starting) throw new SystemMigrationConflictError("Migration is still running");
    // A first installation may initialize an empty control record. Once a
    // write outcome is unknown, only a fresh locked observation can clear it.
    await this.#dependencies.records.load().catch(() => undefined);
    await this.#reloadRecord();
    if (!this.#record || isDataRootMigrationTerminal(this.#record.status)) {
      this.#lease?.finish(); this.#lease = null;
      return this.current();
    }
    this.#lease ??= await this.#dependencies.maintenance.begin();
    await this.#reconcile(true, null);
    return this.current();
  }

  #assertAgentIdle() {
    if (this.#dependencies.hasActiveAgentWork()) throw new SystemMigrationConflictError("Agent sessions and Codex logins must finish before migrating data");
  }

  #run(work: () => Promise<void>) {
    this.#work = work().catch(async (error: unknown) => {
      if (this.#record) this.#record = { ...this.#record, status: "recovery-required", commitOutcome: "unknown", errorMessage: message(error) };
      if (this.#lease) await this.#requestRecoveryRestart();
    }).finally(() => { this.#work = null; });
  }

  #requireRecord() {
    if (!this.#record) throw new Error("Migration record is unavailable");
    return this.#record;
  }

  async #persist(update: Partial<DataRootMigrationRecord>) {
    const previous = this.#requireRecord();
    const next = { ...previous, ...update };
    try { await this.#dependencies.records.replace(previous, next); }
    catch (error) { this.#recordUnavailable = true; throw error; }
    this.#record = next;
    return next;
  }

  async #execute() {
    try {
      this.#lease = await this.#dependencies.maintenance.begin();
      this.#assertAgentIdle();
      const record = await this.#persist({ status: "copying" });
      await this.#dependencies.files.copy(record.sourceIdentity, record.destination, async (targetIdentity) => {
        await this.#persist({ targetIdentity });
      });
      const copied = await this.#persist({ status: "verifying" });
      if (!copied.targetIdentity) throw new Error("Migration destination ownership was not recorded");
      const manifestDigest = await this.#dependencies.files.verify(copied.sourceIdentity, copied.targetIdentity);
      const prepared = await this.#persist({ manifestDigest, status: "committing", commitOutcome: "unknown" });
      await this.#dependencies.bootstrap.commitDataRootChange(prepared.change);
      await this.#restart();
    } catch (error) {
      if (this.#recordUnavailable) throw error;
      await this.#reconcile(false, error);
    }
  }

  async #restart() {
    await this.#persist({ status: "restarting", commitOutcome: "committed", errorMessage: null });
    try { await this.#dependencies.requestRestart(); }
    catch (error) { await this.#persist({ errorMessage: `Automatic restart failed: ${message(error)}` }); }
  }

  async #requestRecoveryRestart() {
    try { await this.#dependencies.requestRestart(); }
    catch (error) {
      if (this.#record) this.#record = { ...this.#record, errorMessage: `${this.#record.errorMessage ?? "Migration needs recovery"}; automatic restart failed: ${message(error)}` };
    }
  }

  async #reconcile(startup: boolean, cause: unknown) {
    try {
      const record = await this.#persist({ status: "reconciling", commitOutcome: "unknown" });
      const outcome = await this.#dependencies.bootstrap.reconcileDataRootChange(record.change);
      if (outcome === "not-committed") {
        const source = await this.#dependencies.files.identify(record.source);
        if (source.device !== record.sourceIdentity.device || source.inode !== record.sourceIdentity.inode) throw new Error("Migration source identity changed");
        await this.#persist({ status: "failed", commitOutcome: outcome, errorMessage: cause ? message(cause) : "Migration was interrupted before the pointer committed" });
        this.#lease?.finish(); this.#lease = null;
        return;
      }
      if (!record.targetIdentity || !record.manifestDigest) throw new Error("Committed migration has no verified destination record");
      await this.#dependencies.files.verifyTarget(record.targetIdentity, record.manifestDigest);
      if (startup) {
        await this.#persist({ status: "completed", commitOutcome: outcome, errorMessage: null });
        this.#lease?.finish(); this.#lease = null;
      } else {
        await this.#restart();
      }
    } catch (error) {
      if (this.#recordUnavailable) throw error;
      await this.#persist({ status: "recovery-required", commitOutcome: "unknown", errorMessage: message(error) });
      if (!startup) await this.#requestRecoveryRestart();
    }
  }
}
