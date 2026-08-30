// SPDX-License-Identifier: GPL-3.0-or-later

import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  SystemMigrationConflictError,
  SystemMigrationNotFoundError,
} from "../../../application/system/systemConfiguration.ts";
import type {
  DataRootMigrationStatus,
  SystemMaintenanceLease,
  SystemMaintenancePort,
} from "../../../application/system/systemConfiguration.ts";
import type { BootstrapConfigurationStore } from "./bootstrapConfigurationStore.ts";
import type { DataRootMigrationCoordinator } from "./systemAdministrationService.ts";
import {
  dataRootMigrationFileOperations,
  type DataRootMigrationFileOperations,
} from "./dataRootMigrationFiles.ts";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type DataRootMigrationReservation =
  | { kind: "starting" }
  | { id: string; kind: "active" };

export class FileDataRootMigrationCoordinator implements DataRootMigrationCoordinator {
  readonly #agentProviderOperations: { hasPendingCodexLogin(): boolean };
  readonly #agentService: { hasResidentSessions(): boolean };
  readonly #bootstrap: BootstrapConfigurationStore;
  readonly #controlRoot: string;
  readonly #files: DataRootMigrationFileOperations;
  readonly #maintenance: SystemMaintenancePort;
  readonly #requestRestart: () => Promise<void>;
  readonly #restartDelayMilliseconds: number;
  readonly #statuses = new Map<string, DataRootMigrationStatus>();
  #reservation: DataRootMigrationReservation | null = null;

  constructor({
    agentProviderOperations = { hasPendingCodexLogin: () => false },
    agentService,
    bootstrap,
    controlRoot,
    fileOperations = dataRootMigrationFileOperations,
    maintenance,
    requestRestart,
    restartDelayMilliseconds = 500,
  }: {
    agentProviderOperations?: { hasPendingCodexLogin(): boolean };
    agentService: { hasResidentSessions(): boolean };
    bootstrap: BootstrapConfigurationStore;
    controlRoot: string;
    fileOperations?: DataRootMigrationFileOperations;
    maintenance: SystemMaintenancePort;
    requestRestart(): Promise<void>;
    restartDelayMilliseconds?: number;
  }) {
    this.#agentProviderOperations = agentProviderOperations;
    this.#agentService = agentService;
    this.#bootstrap = bootstrap;
    this.#controlRoot = path.resolve(controlRoot);
    this.#files = fileOperations;
    this.#maintenance = maintenance;
    this.#requestRestart = requestRestart;
    this.#restartDelayMilliseconds = restartDelayMilliseconds;
  }

  async get(migrationId: string) {
    const status = this.#statuses.get(migrationId);

    if (!status) throw new SystemMigrationNotFoundError();
    return status;
  }

  async start(baseRevision: string, destination: string) {
    if (this.#reservation) {
      throw new SystemMigrationConflictError("A data-root migration is already active");
    }
    this.#reservation = { kind: "starting" };
    try {
      if (this.#agentService.hasResidentSessions() ||
          this.#agentProviderOperations.hasPendingCodexLogin()) {
        throw new SystemMigrationConflictError(
          "Agent sessions and Codex logins must finish before migrating data",
        );
      }
      const snapshot = await this.#bootstrap.readSnapshot();

      if (snapshot.revision !== baseRevision) {
        throw new SystemMigrationConflictError(
          "System configuration revision changed",
          snapshot.revision,
        );
      }
      const source = path.resolve(snapshot.configuration.dataRoot);
      const target = await this.#files.prepareDestination(
        destination,
        source,
        this.#controlRoot,
      );
      const id = randomUUID();
      const status: DataRootMigrationStatus = {
        destination: target,
        errorMessage: null,
        id,
        source,
        status: "copying",
      };

      this.#reservation = { id, kind: "active" };
      this.#statuses.set(id, status);
      setTimeout(() => void this.#execute(id, baseRevision), 0);
      return status;
    } finally {
      if (this.#reservation?.kind === "starting") {
        this.#reservation = null;
      }
    }
  }

  async #execute(id: string, baseRevision: string) {
    const initial = this.#statuses.get(id);

    if (!initial) return;
    let lease: SystemMaintenanceLease | undefined;
    let pointerSwitched = false;

    try {
      lease = await this.#maintenance.begin();
      await this.#files.copy(initial.source, initial.destination);
      this.#statuses.set(id, { ...initial, status: "verifying" });
      await this.#files.verify(initial.source, initial.destination);
      await this.#bootstrap.setDataRoot(baseRevision, initial.destination);
      pointerSwitched = true;
      this.#statuses.set(id, { ...initial, status: "restarting" });
      await new Promise((resolve) =>
        setTimeout(resolve, this.#restartDelayMilliseconds)
      );
      try {
        await this.#requestRestart();
      } catch (error) {
        this.#statuses.set(id, {
          ...initial,
          errorMessage: error instanceof Error
            ? `Automatic restart failed: ${error.message}`
            : "Automatic restart failed",
          status: "restarting",
        });
      }
    } catch (error) {
      if (pointerSwitched) return;
      await this.#recordFailure(initial, error, lease);
    }
  }

  async #recordFailure(
    initial: DataRootMigrationStatus,
    error: unknown,
    lease: SystemMaintenanceLease | undefined,
  ) {
    const messages = [errorMessage(error, "Data-root migration failed")];

    try {
      await this.#files.cleanup(initial.destination);
    } catch (cleanupError) {
      messages.push(
        `Destination cleanup failed: ${errorMessage(cleanupError, "unknown error")}`,
      );
    }
    try {
      lease?.finish();
    } catch (maintenanceError) {
      messages.push(
        `Maintenance release failed: ${errorMessage(maintenanceError, "unknown error")}`,
      );
    }
    this.#statuses.set(initial.id, {
      ...initial,
      errorMessage: messages.join("; "),
      status: "failed",
    });
    if (
      this.#reservation?.kind === "active" &&
      this.#reservation.id === initial.id
    ) {
      this.#reservation = null;
    }
  }
}
