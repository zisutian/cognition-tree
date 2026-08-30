// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createSystemConfigurationController,
  type DataRootMigrationStatus,
  type SystemAdministrationPort,
  type SystemConfigurationInput,
  type SystemConfigurationSnapshot,
} from "../../../application/system/systemConfiguration.ts";

const revision = `sha256:${"a".repeat(64)}` as const;
const configuration: SystemConfigurationSnapshot = {
  configuration: {
    dataRoot: "/data/current",
    listenMode: "loopback",
    maxAuditEntries: 1_000,
    port: 3_001,
    publicOrigin: null,
    repositoryHostRoot: null,
  },
  effectiveConfiguration: {
    dataRoot: "/data/current",
    listenMode: "loopback",
    maxAuditEntries: 1_000,
    port: 3_001,
    publicOrigin: null,
    repositoryHostRoot: null,
  },
  ownerCredentialConfigured: false,
  ownerCredentialRotationPending: false,
  restartRequired: false,
  revision,
  version: 1,
};
const preparedConfiguration: SystemConfigurationSnapshot = {
  ...configuration,
  ownerCredentialRotationPending: true,
  revision: `sha256:${"b".repeat(64)}`,
  version: 2,
};
const activatedConfiguration: SystemConfigurationSnapshot = {
  ...preparedConfiguration,
  ownerCredentialConfigured: true,
  ownerCredentialRotationPending: false,
  revision: `sha256:${"e".repeat(64)}`,
  version: 3,
};
const updateRevision = `sha256:${"c".repeat(64)}` as const;
const updateInput: SystemConfigurationInput = {
  listenMode: "loopback",
  maxAuditEntries: 2_000,
  port: 3_001,
  publicOrigin: null,
  repositoryHostRoot: null,
};
const updatedConfiguration: SystemConfigurationSnapshot = {
  ...configuration,
  configuration: {
    ...configuration.configuration,
    maxAuditEntries: updateInput.maxAuditEntries,
  },
  effectiveConfiguration: {
    ...configuration.effectiveConfiguration,
    maxAuditEntries: updateInput.maxAuditEntries,
  },
  revision: `sha256:${"d".repeat(64)}`,
  version: 2,
};

function migration(
  status: DataRootMigrationStatus["status"],
  errorMessage: string | null = null,
): DataRootMigrationStatus {
  return {
    destination: "/data/next",
    errorMessage,
    id: "migration-1",
    source: "/data/current",
    status,
  };
}

function port(statuses: DataRootMigrationStatus[]): SystemAdministrationPort {
  let nextStatus = 1;

  return {
    activateOwnerCredentialRotation: vi.fn(async () => activatedConfiguration),
    clearOwnerCredential: vi.fn(async () => configuration),
    getMigration: vi.fn(async () => statuses[nextStatus++]!),
    load: vi.fn(async () => configuration),
    migrateDataRoot: vi.fn(async () => statuses[0]!),
    prepareOwnerCredentialRotation: vi.fn(async () => ({
      configuration: preparedConfiguration,
      rotationId: "rotation-1",
      secret: "secret",
    })),
    update: vi.fn(async () => configuration),
  };
}

describe("system configuration controller", () => {
  it("updates the caller's exact base revision and returns the published snapshot", async () => {
    const administration = {
      ...port([]),
      update: vi.fn(async () => updatedConfiguration),
    };
    const controller = createSystemConfigurationController(administration, {
      pollMigration: async () => undefined,
      pollMigrationIntervalMilliseconds: 1,
    });

    await controller.load();
    const result = await controller.update({
      baseRevision: updateRevision,
      configuration: updateInput,
    });

    expect(administration.update).toHaveBeenCalledWith(
      updateRevision,
      updateInput,
    );
    expect(result).toBe(updatedConfiguration);
    expect(controller.getSnapshot()).toMatchObject({
      configuration: updatedConfiguration,
      operationStatus: "idle",
    });
  });

  it("publishes a prepared rotation without retaining its secret", async () => {
    const administration = port([]);
    const controller = createSystemConfigurationController(administration, {
      pollMigration: async () => undefined,
      pollMigrationIntervalMilliseconds: 1,
    });

    await controller.load();
    const preparation = await controller.prepareOwnerCredentialRotation();

    expect(preparation).toMatchObject({
      rotationId: "rotation-1",
      secret: "secret",
    });
    expect(administration.prepareOwnerCredentialRotation)
      .toHaveBeenCalledWith(revision);
    const snapshot = controller.getSnapshot();

    expect(snapshot.configuration).toBe(preparedConfiguration);
    expect(snapshot.operationStatus).toBe("idle");
    expect(Object.keys(snapshot).some((key) =>
      key.toLowerCase().includes("secret")
    )).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain(preparation.secret);
  });

  it("activates only the exact prepared revision and rotation id", async () => {
    const administration = port([]);
    const controller = createSystemConfigurationController(administration, {
      pollMigration: async () => undefined,
      pollMigrationIntervalMilliseconds: 1,
    });

    await controller.load();
    await controller.activateOwnerCredentialRotation({
      baseRevision: preparedConfiguration.revision,
      rotationId: "rotation-1",
      secret: "secret",
    });

    expect(administration.activateOwnerCredentialRotation).toHaveBeenCalledWith(
      preparedConfiguration.revision,
      "rotation-1",
      "secret",
    );
    expect(controller.getSnapshot().configuration).toBe(activatedConfiguration);
  });

  it("polls a migration through verification until restart is visible", async () => {
    const administration = port([
      migration("copying"),
      migration("verifying"),
      migration("restarting"),
    ]);
    const pollMigration = vi.fn(async () => undefined);
    const controller = createSystemConfigurationController(administration, {
      pollMigration,
      pollMigrationIntervalMilliseconds: 25,
    });

    await controller.load();
    await controller.migrateDataRoot("/data/next");

    expect(pollMigration).toHaveBeenCalledTimes(2);
    expect(pollMigration).toHaveBeenCalledWith(25);
    expect(administration.getMigration).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({
      errorMessage: null,
      migration: { status: "restarting" },
      operationStatus: "idle",
    });
  });

  it("keeps a failed terminal migration visible and reports its cause", async () => {
    const administration = port([
      migration("copying"),
      migration("failed", "verification mismatch"),
    ]);
    const controller = createSystemConfigurationController(administration, {
      pollMigration: async () => undefined,
      pollMigrationIntervalMilliseconds: 1,
    });

    await controller.load();
    await expect(controller.migrateDataRoot("/data/next"))
      .rejects.toThrow("verification mismatch");
    expect(controller.getSnapshot()).toMatchObject({
      errorMessage: "verification mismatch",
      migration: { errorMessage: "verification mismatch", status: "failed" },
      operationStatus: "idle",
    });
  });
});
