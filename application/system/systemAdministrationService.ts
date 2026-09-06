// SPDX-License-Identifier: GPL-3.0-or-later

import type { SystemAdministrationServerPort } from "./systemConfiguration.ts";
import type { AgentAuditCapacityPort, SystemConfiguration, SystemConfigurationInput, SystemConfigurationSnapshot } from "./systemConfigurationModel.ts";
import type { DataRootMigrationStatus } from "./dataRootMigrationPorts.ts";
import type { SystemBootstrapPort } from "./systemConfigurationPorts.ts";
import type { BootstrapOwnerCredentialActivation, BootstrapConfigurationSnapshot } from "./systemConfigurationPorts.ts";

export type DataRootMigrationPort = {
  current(): Promise<DataRootMigrationStatus | null>;
  reconcile(migrationId: string): Promise<DataRootMigrationStatus>;
  get(migrationId: string): Promise<DataRootMigrationStatus>;
  start(baseRevision: string, destination: string): Promise<DataRootMigrationStatus>;
};

function sameConfiguration(
  left: SystemConfiguration,
  right: SystemConfiguration,
) {
  return left.dataRoot === right.dataRoot &&
    left.listenMode === right.listenMode &&
    left.maxAuditEntries === right.maxAuditEntries &&
    left.port === right.port &&
    left.publicOrigin === right.publicOrigin &&
    left.repositoryHostRoot === right.repositoryHostRoot;
}

export class SystemAdministrationService implements SystemAdministrationServerPort {
  readonly #bootstrap: SystemBootstrapPort;
  #effectiveConfiguration: SystemConfiguration;
  readonly #ledger: AgentAuditCapacityPort;
  readonly #migrations: DataRootMigrationPort;
  #runtimeApplyErrorMessage: string | null = null;
  #updateQueue: Promise<void> = Promise.resolve();

  constructor({
    bootstrap,
    effectiveConfiguration,
    ledger,
    migrations,
  }: {
    bootstrap: SystemBootstrapPort;
    effectiveConfiguration: SystemConfiguration;
    ledger: AgentAuditCapacityPort;
    migrations: DataRootMigrationPort;
  }) {
    this.#bootstrap = bootstrap;
    this.#effectiveConfiguration = { ...effectiveConfiguration };
    this.#ledger = ledger;
    this.#migrations = migrations;
  }

  activateOwnerCredentialRotation(
    baseRevision: string,
    rotationId: string,
    secret: string,
  ) {
    return this.#bootstrap.activateOwnerCredentialRotation(
      baseRevision,
      rotationId,
      secret,
    ).then((activation) => this.#projectActivation(activation));
  }

  clearOwnerCredential(baseRevision: string) {
    return this.#bootstrap.clearOwnerCredential(baseRevision).then((snapshot) =>
      this.#project(snapshot)
    );
  }

  getCurrentMigration() { return this.#migrations.current(); }

  reconcileMigration(migrationId: string) { return this.#migrations.reconcile(migrationId); }

  getMigration(migrationId: string) {
    return this.#migrations.get(migrationId);
  }

  async load() {
    return this.#project(await this.#bootstrap.readSnapshot());
  }

  migrateDataRoot(baseRevision: string, destination: string) {
    return this.#migrations.start(baseRevision, destination);
  }

  async prepareOwnerCredentialRotation(baseRevision: string) {
    const preparation = await this.#bootstrap.prepareOwnerCredentialRotation(
      baseRevision,
    );

    return {
      configuration: this.#project(preparation.configuration),
      rotationId: preparation.rotationId,
      secret: preparation.secret,
    };
  }

  update(
    baseRevision: string,
    configuration: SystemConfigurationInput,
  ) {
    const pending = this.#updateQueue.then(() =>
      this.#update(baseRevision, configuration)
    );

    this.#updateQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  async #update(
    baseRevision: string,
    configuration: SystemConfigurationInput,
  ) {
    const snapshot = await this.#bootstrap.update(baseRevision, configuration);

    if (
      snapshot.configuration.maxAuditEntries !==
        this.#effectiveConfiguration.maxAuditEntries
    ) {
      try {
        await this.#ledger.updateMaximumEntries(
          snapshot.configuration.maxAuditEntries,
        );
        this.#effectiveConfiguration = {
          ...this.#effectiveConfiguration,
          maxAuditEntries: snapshot.configuration.maxAuditEntries,
        };
        this.#runtimeApplyErrorMessage = null;
      } catch (error) {
        this.#runtimeApplyErrorMessage = error instanceof Error
          ? error.message
          : "Operation audit capacity could not be applied";
      }
    } else {
      this.#runtimeApplyErrorMessage = null;
    }
    return this.#project(snapshot);
  }

  #project(
    snapshot: BootstrapConfigurationSnapshot,
  ): SystemConfigurationSnapshot {
    return {
      ...snapshot,
      effectiveConfiguration: { ...this.#effectiveConfiguration },
      restartRequired: !sameConfiguration(
        snapshot.configuration,
        this.#effectiveConfiguration,
      ),
      runtimeApplyErrorMessage: this.#runtimeApplyErrorMessage,
    };
  }

  #projectActivation(
    activation: BootstrapOwnerCredentialActivation,
  ) {
    return {
      configuration: this.#project(activation.configuration),
      ownerSession: activation.ownerSession,
    };
  }
}
