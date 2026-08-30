// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  DataRootMigrationStatus,
  AgentAuditCapacityPort,
  SystemAdministrationServerPort,
  SystemConfiguration,
  SystemConfigurationInput,
  SystemConfigurationSnapshot,
} from "../../../application/system/systemConfiguration.ts";
import type {
  BootstrapOwnerCredentialActivation,
  BootstrapConfigurationSnapshot,
  BootstrapConfigurationStore,
} from "./bootstrapConfigurationStore.ts";

export type DataRootMigrationCoordinator = {
  get(migrationId: string): Promise<DataRootMigrationStatus>;
  start(baseRevision: string, destination: string): Promise<DataRootMigrationStatus>;
};

function sameConfiguration(
  left: SystemConfiguration,
  right: SystemConfiguration,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class SystemAdministrationService implements SystemAdministrationServerPort {
  readonly #bootstrap: BootstrapConfigurationStore;
  #effectiveConfiguration: SystemConfiguration;
  readonly #ledger: AgentAuditCapacityPort;
  readonly #migrations: DataRootMigrationCoordinator;

  constructor({
    bootstrap,
    effectiveConfiguration,
    ledger,
    migrations,
  }: {
    bootstrap: BootstrapConfigurationStore;
    effectiveConfiguration: SystemConfiguration;
    ledger: AgentAuditCapacityPort;
    migrations: DataRootMigrationCoordinator;
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

  async update(
    baseRevision: string,
    configuration: SystemConfigurationInput,
  ) {
    const snapshot = await this.#bootstrap.update(baseRevision, configuration);

    if (
      snapshot.configuration.maxAuditEntries !==
        this.#effectiveConfiguration.maxAuditEntries
    ) {
      await this.#ledger.updateMaximumEntries(
        snapshot.configuration.maxAuditEntries,
      );
      this.#effectiveConfiguration = {
        ...this.#effectiveConfiguration,
        maxAuditEntries: snapshot.configuration.maxAuditEntries,
      };
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
