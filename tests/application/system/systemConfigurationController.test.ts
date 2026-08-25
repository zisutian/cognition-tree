// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createSystemConfigurationController,
  type DataRootMigrationStatus,
  type SystemAdministrationPort,
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
  restartRequired: false,
  revision,
  version: 1,
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
    clearOwnerCredential: vi.fn(async () => configuration),
    getMigration: vi.fn(async () => statuses[nextStatus++]!),
    load: vi.fn(async () => configuration),
    migrateDataRoot: vi.fn(async () => statuses[0]!),
    rotateOwnerCredential: vi.fn(async () => ({ configuration, secret: "secret" })),
    update: vi.fn(async () => configuration),
  };
}

describe("system configuration controller", () => {
  it("keeps a rotated owner secret only until the user dismisses it", async () => {
    const controller = createSystemConfigurationController(port([]), {
      pollMigration: async () => undefined,
      pollMigrationIntervalMilliseconds: 1,
    });

    await controller.load();
    await controller.rotateOwnerCredential();
    expect(controller.getSnapshot().revealedOwnerSecret).toBe("secret");
    controller.dismissRevealedOwnerSecret();
    expect(controller.getSnapshot().revealedOwnerSecret).toBeNull();
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
